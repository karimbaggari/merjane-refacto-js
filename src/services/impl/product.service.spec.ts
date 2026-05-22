import {
	describe, it, expect, beforeEach,
	afterEach,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {type INotificationService} from '../notifications.port.js';
import {createDatabaseMock, cleanUp} from '../../utils/test-utils/database-tools.ts.js';
import {OrderService} from '../order.service.js';
import {ProductHelper} from '@/helpers/product.helper.js';
import {ProductRepository} from '@/repositories/product.repository.js';
import {products, orders, ordersToProducts, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {eq} from 'drizzle-orm';

describe('OrderService Tests', () => {
	let notificationServiceMock: DeepMockProxy<INotificationService>;
	let orderService: OrderService;
	let databaseMock: Database;
	let databaseName: string;
	let closeDatabase: () => void;

	beforeEach(async () => {
		({databaseMock, databaseName, close: closeDatabase} = await createDatabaseMock());
		notificationServiceMock = mockDeep<INotificationService>();

		const productRepository = new ProductRepository({db: databaseMock});
		const productHelper = new ProductHelper({
			notificationService: notificationServiceMock,
			productRepository,
		});
		orderService = new OrderService({productHelper, productRepository});
	});

	afterEach(async () => {
		closeDatabase();
		await cleanUp(databaseName);
	});

	function insertOrderWithProduct(db: Database, product: Omit<Product, 'id'> & {id?: number}): {orderId: number; productId: number} {
		return db.transaction(tx => {
			const productId = tx.insert(products).values(product).returning({id: products.id}).get().id;
			const orderId = tx.insert(orders).values({}).returning({id: orders.id}).get().id;
			tx.insert(ordersToProducts).values({orderId, productId}).run();
			return {orderId, productId};
		});
	}

	it('should handle delay notification correctly', async () => {
		// GIVEN
		const {orderId, productId} = insertOrderWithProduct(databaseMock, {
			leadTime: 15,
			available: 0,
			type: 'NORMAL',
			name: 'RJ45 Cable',
			expiryDate: null,
			seasonStartDate: null,
			seasonEndDate: null,
		});

		// WHEN
		await orderService.processOrder(orderId);

		// THEN
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(15, 'RJ45 Cable');
		const result = await databaseMock.query.products.findFirst({
			where: eq(products.id, productId),
		});
		expect(result!.available).toBe(0);
	});

	it('should send out of stock notification when lead time pushes past season end', async () => {
		// GIVEN
		const {orderId, productId} = insertOrderWithProduct(databaseMock, {
			leadTime: 90,
			available: 0,
			type: 'SEASONAL',
			name: 'Watermelon',
			expiryDate: null,
			seasonStartDate: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)), // il y a 2 jours
			seasonEndDate: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)), // dans 10 jours
		});

		// WHEN
		await orderService.processOrder(orderId);

		// THEN
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Watermelon');
		const result = await databaseMock.query.products.findFirst({
			where: eq(products.id, productId),
		});
		expect(result!.available).toBe(0);
	});

	it('should send out of stock notification when season has not started yet', async () => {
		// GIVEN
		const {orderId} = insertOrderWithProduct(databaseMock, {
			leadTime: 15,
			available: 30,
			type: 'SEASONAL',
			name: 'Grapes',
			expiryDate: null,
			seasonStartDate: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // dans 30 jours
			seasonEndDate: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)), // dans 90 jours
		});

		// WHEN
		await orderService.processOrder(orderId);

		// THEN
		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Grapes');
	});

	it('should send delay notification when in season and lead time fits within season', async () => {
		// GIVEN
		const {orderId} = insertOrderWithProduct(databaseMock, {
			leadTime: 5,
			available: 0,
			type: 'SEASONAL',
			name: 'Watermelon',
			expiryDate: null,
			seasonStartDate: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)), // il y a 10 jours
			seasonEndDate: new Date(Date.now() + (50 * 24 * 60 * 60 * 1000)), // dans 50 jours
		});

		// WHEN
		await orderService.processOrder(orderId);

		// THEN
		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(5, 'Watermelon');
	});

	it('should decrement available when product is not expired and in stock', async () => {
		// GIVEN
		const {orderId, productId} = insertOrderWithProduct(databaseMock, {
			leadTime: 15,
			available: 10,
			type: 'EXPIRABLE',
			name: 'Butter',
			expiryDate: new Date(Date.now() + (26 * 24 * 60 * 60 * 1000)), // expire dans 26 jours
			seasonStartDate: null,
			seasonEndDate: null,
		});

		// WHEN
		await orderService.processOrder(orderId);

		// THEN
		const result = await databaseMock.query.products.findFirst({
			where: eq(products.id, productId),
		});
		expect(result!.available).toBe(9);
	});

	it('should send expiration notification and set available to 0 when product is expired', async () => {
		// GIVEN
		const expiryDate = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)); // expiré il y a 2 jours
		const {orderId, productId} = insertOrderWithProduct(databaseMock, {
			leadTime: 15,
			available: 6,
			type: 'EXPIRABLE',
			name: 'Milk',
			expiryDate,
			seasonStartDate: null,
			seasonEndDate: null,
		});

		// WHEN
		await orderService.processOrder(orderId);

		// THEN
		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Milk', expiryDate);
		const result = await databaseMock.query.products.findFirst({
			where: eq(products.id, productId),
		});
		expect(result!.available).toBe(0);
	});
});

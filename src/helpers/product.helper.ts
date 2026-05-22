import {type INotificationService} from '@/services/notifications.port.js';
import {type Product} from '@/db/schema.js';
import {type ProductRepository} from '@/repositories/product.repository.js';

type ProductHelperDeps = {
	notificationService: INotificationService;
	productRepository: ProductRepository;
};

export class ProductHelper {
	private readonly notificationService: INotificationService;
	private readonly productRepository: ProductRepository;

	public constructor({notificationService, productRepository}: ProductHelperDeps) {
		this.notificationService = notificationService;
		this.productRepository = productRepository;
	}

	public async decrementStock(product: Product): Promise<void> {
		product.available -= 1;
		await this.productRepository.updateProduct(product);
	}

	public async clearInventory(product: Product): Promise<void> {
		product.available = 0;
		await this.productRepository.updateProduct(product);
	}

	public notifyDelay(product: Product): void {
		this.notificationService.sendDelayNotification(product.leadTime, product.name);
	}

	public notifyOutOfStock(product: Product): void {
		this.notificationService.sendOutOfStockNotification(product.name);
	}

	public notifyExpired(product: Product): void {
		this.notificationService.sendExpirationNotification(product.name, product.expiryDate!);
	}
}

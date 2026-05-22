import {type Cradle, diContainer} from '@fastify/awilix';
import {asClass, asValue} from 'awilix';
import {type FastifyBaseLogger, type FastifyInstance} from 'fastify';
import {type INotificationService} from '@/services/notifications.port.js';
import {NotificationService} from '@/services/impl/notification.service.js';
import {type Database} from '@/db/type.js';
import {ProductRepository} from '@/repositories/product.repository.js';
import {OrderRepository} from '@/repositories/order.repository.js';
import {ProductHelper} from '@/helpers/product.helper.js';
import {OrderService} from '@/services/impl/order.service.js';

declare module '@fastify/awilix' {

	interface Cradle { // eslint-disable-line @typescript-eslint/consistent-type-definitions
		logger: FastifyBaseLogger;
		db: Database;
		notificationService: INotificationService;
		productRepository: ProductRepository;
		orderRepository: OrderRepository;
		productHelper: ProductHelper;
		orderService: OrderService;
	}
}

export async function configureDiContext(
	server: FastifyInstance,
): Promise<void> {
	diContainer.register({
		logger: asValue(server.log),
		db: asValue(server.database),
		notificationService: asClass(NotificationService),
		productRepository: asClass(ProductRepository),
		orderRepository: asClass(OrderRepository),
		productHelper: asClass(ProductHelper),
		orderService: asClass(OrderService),
	});
}

export function resolve<Service extends keyof Cradle>(
	service: Service,
): Cradle[Service] {
	return diContainer.resolve(service);
}

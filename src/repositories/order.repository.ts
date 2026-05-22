import {eq} from 'drizzle-orm';
import {type Cradle} from '@fastify/awilix';
import {orders, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

type OrderWithProducts = {
	id: number;
	products: {product: Product}[];
};

export class OrderRepository {
	private readonly db: Database;

	public constructor({db}: Pick<Cradle, 'db'>) {
		this.db = db;
	}

	public async findOrderWithProducts(orderId: number): Promise<OrderWithProducts | undefined> {
		return this.db.query.orders.findFirst({
			where: eq(orders.id, orderId),
			with: {
				products: {
					columns: {},
					with: {
						product: true,
					},
				},
			},
		});
	}
}

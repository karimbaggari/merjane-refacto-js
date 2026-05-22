import {eq} from 'drizzle-orm';
import {type Cradle} from '@fastify/awilix';
import {orders, products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export class ProductRepository {
	private readonly db: Database;

	public constructor({db}: Pick<Cradle, 'db'>) {
		this.db = db;
	}

	public async findOrderWithProducts(orderId: number) {
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

	public async updateProduct(product: Product): Promise<void> {
		await this.db.update(products).set(product).where(eq(products.id, product.id));
	}
}

import {type Product} from '@/db/schema.js';
import {type ProductHelper} from '@/helpers/product.helper.js';
import {type ProductRepository} from '@/repositories/product.repository.js';
import {PRODUCT_TYPE} from '@/constants/product.constants.js';
import {
	isAvailable,
	isExpired,
	isInSeason,
	canBeRestockedInSeason,
	hasLeadTime,
	hasSeasonStarted,
} from '@/validators/product.validator.js';

type OrderServiceDeps = {
	productHelper: ProductHelper;
	productRepository: ProductRepository;
};

export class OrderService {
	private readonly productHelper: ProductHelper;
	private readonly productRepository: ProductRepository;

	public constructor({productHelper, productRepository}: OrderServiceDeps) {
		this.productHelper = productHelper;
		this.productRepository = productRepository;
	}

	public async processOrder(orderId: number): Promise<{orderId: number}> {
		const order = await this.productRepository.findOrderWithProducts(orderId);
		if (!order) {
			throw new Error(`Order not found: ${orderId}`);
		}

		const {products: productList} = order;

		if (productList) {
			for (const {product} of productList) {
				await this.processProduct(product); // eslint-disable-line no-await-in-loop
			}
		}

		return {orderId: order.id};
	}

	private async processProduct(product: Product): Promise<void> {
		switch (product.type) {
			case PRODUCT_TYPE.NORMAL: {
				await this.processNormal(product);
				break;
			}

			case PRODUCT_TYPE.SEASONAL: {
				await this.processSeasonal(product);
				break;
			}

			case PRODUCT_TYPE.EXPIRABLE: {
				await this.processExpirable(product);
				break;
			}

			default: {
				break;
			}
		}
	}

	private async processNormal(product: Product): Promise<void> {
		if (isAvailable(product)) {
			await this.productHelper.decrementStock(product);
		} else if (hasLeadTime(product)) {
			await this.productHelper.notifyDelay(product);
		}
	}

	private async processSeasonal(product: Product): Promise<void> {
		if (isInSeason(product) && isAvailable(product)) {
			await this.productHelper.decrementStock(product);
		} else if (!canBeRestockedInSeason(product)) {
			await this.productHelper.notifyOutOfStock(product);
		} else if (!hasSeasonStarted(product)) {
			await this.productHelper.notifyOutOfStock(product);
		} else {
			await this.productHelper.notifyDelay(product);
		}
	}

	private async processExpirable(product: Product): Promise<void> {
		if (isAvailable(product) && !isExpired(product)) {
			await this.productHelper.decrementStock(product);
		} else {
			await this.productHelper.notifyExpired(product);
		}
	}
}

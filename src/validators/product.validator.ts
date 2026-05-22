import {MILLISECONDS_PER_DAY} from '@/constants/product.constants.js';
import {type Product} from '@/db/schema.js';

export function isAvailable(product: Product): boolean {
	return product.available > 0;
}

export function isExpired(product: Product): boolean {
	return product.expiryDate! <= new Date();
}

export function isInSeason(product: Product): boolean {
	const now = new Date();
	return now > product.seasonStartDate! && now < product.seasonEndDate!;
}

export function canBeRestockedInSeason(product: Product): boolean {
	const now = new Date();
	return new Date(now.getTime() + (product.leadTime * MILLISECONDS_PER_DAY)) <= product.seasonEndDate!;
}

export function hasLeadTime(product: Product): boolean {
	return product.leadTime > 0;
}

export function hasSeasonStarted(product: Product): boolean {
	return product.seasonStartDate! <= new Date();
}

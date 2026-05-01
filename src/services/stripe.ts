import Stripe from 'stripe'
import { ProductWithPrices } from '../types'

export async function listAllProducts(
  stripe: Stripe,
  products: Stripe.Product[] = [],
  startingAfter?: string
): Promise<Stripe.Product[]> {
  const { data, has_more } = await stripe.products.list({
    limit: 100,
    active: true,
    starting_after: startingAfter,
  })

  const mergedProducts = [...products, ...data]

  if (!has_more || data.length === 0) {
    return mergedProducts
  }

  const lastProduct = data[data.length - 1]
  return listAllProducts(stripe, mergedProducts, lastProduct.id)
}

export async function listProductPrices(
  stripe: Stripe,
  productId: string,
  prices: Stripe.Price[] = [],
  startingAfter?: string
): Promise<Stripe.Price[]> {
  const { data, has_more } = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
    starting_after: startingAfter,
  })

  const mergedPrices = [...prices, ...data]

  if (!has_more || data.length === 0) {
    return mergedPrices
  }

  const lastPrice = data[data.length - 1]
  return listProductPrices(stripe, productId, mergedPrices, lastPrice.id)
}

export async function getProductWithPrices(
  stripe: Stripe,
  product: Stripe.Product
): Promise<ProductWithPrices> {
  const prices = await listProductPrices(stripe, product.id)
  return { ...product, prices }
}

export async function listAllProductsWithPrices(
  stripe: Stripe
): Promise<ProductWithPrices[]> {
  const products = await listAllProducts(stripe)
  return Promise.all(
    products.map((product) => getProductWithPrices(stripe, product))
  )
}

import Stripe from 'stripe'

export type Variables = {
  stripe: Stripe
}

export type ProductWithPrices = Stripe.Product & {
  prices: Stripe.Price[]
}

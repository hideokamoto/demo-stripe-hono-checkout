import Stripe from 'stripe'
import { MiddlewareHandler } from 'hono'
import { Variables } from '../types'

export const stripeMiddleware = (): MiddlewareHandler<{
  Bindings: Env
  Variables: Variables
}> => {
  return async (c, next) => {
    const apiKey = c.env.STRIPE_SECRET_KEY

    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }

    const stripe = new Stripe(apiKey, {
      apiVersion: Stripe.API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
    })

    c.set('stripe', stripe)
    await next()
  }
}

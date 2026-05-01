import { describe, it, expect } from 'vitest'
import Stripe from 'stripe'
import app from './index'
import { createWebhookRequest } from './test-helpers/webhook'

const WEBHOOK_SECRET = 'whsec_test_secret'
type JsonBody = {
  received?: boolean
  error?: string
}

const TEST_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  BASE_URL: 'http://localhost:8787',
}

const stripe = new Stripe('sk_test_example', {
  apiVersion: Stripe.API_VERSION,
})

describe('Webhook Handler', () => {
  it('署名が正しい場合、200を返す', async () => {
    const payload = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1234567890',
          object: 'checkout.session',
          payment_status: 'paid',
          customer_details: {
            email: 'customer@example.com',
          },
        },
      },
    }
    const payloadString = JSON.stringify(payload)
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: WEBHOOK_SECRET,
    })

    const res = await app.request(
      '/api/webhook',
      {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
          'content-type': 'application/json',
        },
        body: payloadString,
      },
      TEST_ENV
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as JsonBody
    expect(data.received).toBe(true)
  })

  it('署名がない場合、400を返す', async () => {
    const res = await app.request(
      '/api/webhook',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'test' }),
      },
      TEST_ENV
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as JsonBody
    expect(data.error).toBe('No signature')
  })

  it('署名が不正な場合、400を返す', async () => {
    const res = await app.request(
      '/api/webhook',
      {
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid_signature',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'test' }),
      },
      TEST_ENV
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as JsonBody
    expect(data.error).toBe('Webhook error')
  })

  it('STRIPE_WEBHOOK_SECRETが未設定の場合、500を返す', async () => {
    const payload = JSON.stringify({ type: 'test' })
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    })

    const res = await app.request(
      '/api/webhook',
      {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
          'content-type': 'application/json',
        },
        body: payload,
      },
      {
        STRIPE_SECRET_KEY: 'sk_test_example',
        STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
        BASE_URL: 'http://localhost:8787',
      }
    )

    expect(res.status).toBe(500)
    const data = (await res.json()) as JsonBody
    expect(data.error).toBe('STRIPE_WEBHOOK_SECRET is not set')
  })

  it('未知のイベントタイプでも200を返す', async () => {
    const requestOptions = createWebhookRequest(
      WEBHOOK_SECRET,
      'payment_intent.succeeded',
      {
        id: 'pi_test_1234567890',
        status: 'succeeded',
      }
    )

    const res = await app.request('/api/webhook', requestOptions, TEST_ENV)
    expect(res.status).toBe(200)
  })
})

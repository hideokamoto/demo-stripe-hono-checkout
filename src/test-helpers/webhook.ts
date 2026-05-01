import Stripe from 'stripe'

const stripe = new Stripe('sk_test_example', {
  apiVersion: Stripe.API_VERSION,
})

export function createWebhookRequest(
  webhookSecret: string,
  eventType: string,
  eventData: unknown
) {
  const payload = {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    type: eventType,
    data: {
      object: eventData,
    },
  }

  const payloadString = JSON.stringify(payload)
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: webhookSecret,
  })

  return {
    method: 'POST' as const,
    headers: {
      'stripe-signature': signature,
      'content-type': 'application/json',
    },
    body: payloadString,
  }
}

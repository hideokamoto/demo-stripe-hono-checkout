import { Hono } from 'hono'
import type { Child } from 'hono/jsx'
import Stripe from 'stripe'
import { stripeMiddleware } from './middleware/stripe'
import { Variables } from './types'
import { listAllProductsWithPrices } from './services/stripe'

const app = new Hono<{
  Bindings: Env
  Variables: Variables
}>()

app.use('*', stripeMiddleware())

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

const formatPrice = (unitAmount: number, currency: string) => {
  const upper = currency.toUpperCase()
  const amount = ZERO_DECIMAL_CURRENCIES.has(upper)
    ? unitAmount
    : unitAmount / 100

  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: upper,
  }).format(amount)
}

const Layout = (props: { title: string; children: Child }) => (
  <html>
    <head>
      <title>{props.title}</title>
      <meta charset="utf-8" />
      <style>{`
        body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
        .product { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .product h2 { margin-top: 0; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; }
        button { background-color: #635BFF; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #4F46E5; }
      `}</style>
    </head>
    <body>{props.children}</body>
  </html>
)

app.get('/hello', (c) => c.text('Hello!'))

app.get('/api/stripe-test', async (c) => {
  const stripe = c.get('stripe')
  const products = await stripe.products.list({ limit: 1 })

  return c.json({
    ok: true,
    message: 'Stripe API に接続できました',
    sampleProductId: products.data[0]?.id ?? null,
  })
})

app.get('/', async (c) => {
  try {
    const stripe = c.get('stripe')
    const products = await listAllProductsWithPrices(stripe)

    return c.html(
      <Layout title="商品一覧">
        <h1>商品一覧</h1>
        {products.length === 0 ? (
          <p>商品がありません</p>
        ) : (
          <div>
            {products.map((product) => (
              <div class="product" key={product.id}>
                <h2>{product.name}</h2>
                {product.description ? <p>{product.description}</p> : null}
                {product.prices.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>プラン</th>
                        <th>料金</th>
                        <th>タイプ</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.prices
                        .filter((price) => price.unit_amount != null)
                        .map((price) => (
                          <tr key={price.id}>
                            <td>{price.nickname || '標準'}</td>
                            <td>
                              {formatPrice(price.unit_amount!, price.currency)}
                            </td>
                            <td>
                              {price.type === 'one_time' ? '一回払い' : '定期払い'}
                            </td>
                            <td>
                              <form method="post" action="/checkout">
                                <input type="hidden" name="priceId" value={price.id} />
                                <button type="submit">購入する</button>
                              </form>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <p>有効な価格がありません</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Layout>
    )
  } catch (error) {
    console.error('Error rendering products:', error)
    return c.html(
      <Layout title="エラー">
        <h1>表示に失敗しました</h1>
      </Layout>,
      500
    )
  }
})

app.get('/success', (c) => {
  const sessionId = c.req.query('session_id')
  return c.html(
    <Layout title="購入完了">
      <div style="text-align: center; margin-top: 50px;">
        <h1>購入が完了しました！</h1>
        <p>ご購入ありがとうございます。</p>
        {sessionId ? <p>セッションID: {sessionId}</p> : null}
        <a href="/">トップページに戻る</a>
      </div>
    </Layout>
  )
})

app.get('/cancel', (c) => {
  return c.html(
    <Layout title="購入キャンセル">
      <div style="text-align: center; margin-top: 50px;">
        <h1>購入がキャンセルされました</h1>
        <p>決済は完了していません。</p>
        <a href="/">商品一覧に戻る</a>
      </div>
    </Layout>
  )
})

app.get('/api/products', async (c) => {
  try {
    const stripe = c.get('stripe')
    const products = await listAllProductsWithPrices(stripe)
    return c.json({ products })
  } catch (error) {
    console.error('Error fetching products:', error)
    return c.json({ error: 'Failed to fetch products' }, 500)
  }
})

app.post('/checkout', async (c) => {
  try {
    const stripe = c.get('stripe')
    const body = await c.req.parseBody()
    const priceId = typeof body['priceId'] === 'string' ? body['priceId'] : undefined

    if (!priceId) {
      return c.text('priceId is required', 400)
    }

    const price = await stripe.prices.retrieve(priceId)
    const mode = price.type === 'recurring' ? 'subscription' : 'payment'
    const baseUrl = c.env.BASE_URL || 'http://localhost:8787'

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
    })

    if (!session.url) {
      return c.text('Failed to get Checkout URL', 500)
    }

    return c.redirect(session.url, 303)
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return c.text('Failed to create checkout session', 500)
  }
})

app.post('/api/webhook', async (c) => {
  const stripe = c.get('stripe')
  const sig = c.req.header('stripe-signature')

  if (!sig) {
    return c.json({ error: 'No signature' }, 400)
  }

  try {
    const body = await c.req.text()
    const endpointSecret = c.env.STRIPE_WEBHOOK_SECRET

    if (!endpointSecret) {
      return c.json({ error: 'STRIPE_WEBHOOK_SECRET is not set' }, 500)
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      endpointSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        console.log('決済完了:', session.id)
        console.log('支払い状態:', session.payment_status)
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object
        console.log('セッション期限切れ:', session.id)
        break
      }
      default:
        console.log(`未処理のイベント: ${event.type}`)
    }

    return c.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return c.json({ error: 'Webhook error' }, 400)
  }
})

export default app

import { SessionProvider } from 'next-auth/react';
import Layout, { layout } from '../components/layout';
import '@/styles/globals.css'

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </SessionProvider>
  )
}

import { SessionProvider } from 'next-auth/react';
import { BodyCompositionProvider } from '../contexts/bodycomposition.context';
import Layout, { layout } from '../components/layout';
import '@/styles/globals.css'

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <BodyCompositionProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </BodyCompositionProvider>
    </SessionProvider>
  )
}

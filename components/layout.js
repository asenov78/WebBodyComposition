import Head from 'next/head'
import { useRouter } from 'next/router'
import Navbar from './navbar'
import Footer from './footer'

// The login page has its own hero banner (name + logo already shown there,
// nicely centered) — the navbar's logo+name on the left duplicated that
// clumsily. Hidden here rather than on other auth pages since those don't
// have the same duplication problem yet.
const NO_NAVBAR_PATHS = ['/login'];

export default function Layout({ children }) {
    const router = useRouter();
    const showNavbar = !NO_NAVBAR_PATHS.includes(router.pathname);

    return (
        <>
            <Head>
                <title>Web Body Composition</title>
                <meta
                    name="description"
                    content="Web App to export data from Mi Body Composition Scale and upload it to Garmin Connect Cloud"
                    key="desc"
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {/* SVG favicon (our own mark, public/logo.svg) first — modern browsers
                    prefer it; favicon.ico kept as a fallback for the ones that don't
                    support SVG favicons yet. */}
                <link rel="icon" type="image/svg+xml" href="/logo.svg" />
                <link rel="icon" href="/favicon.ico" sizes="any" />
            </Head>
            <div className='app-shell'>
                {showNavbar && <Navbar />}
                <main className='app-main section'>
                    {children}
                </main>

                <Footer />
            </div>
        </>
    )
}
import Head from 'next/head'
import Navbar from './navbar'
import Footer from './footer'

export default function Layout({ children }) {
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
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <div className='app-shell'>
                <Navbar />
                <main className='app-main section'>
                    {children}
                </main>

                <Footer />
            </div>
        </>
    )
}
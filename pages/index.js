import Link from 'next/link'

export default function Home() {
  return (
    <>
      <div className='max-w-sm mx-auto'>
        <div>
          <h1 className='text-3xl font-bold text-center'>Web Body Composition</h1>
        </div>
        <div className='text-justify '>
          <p className='p-3'> This app pulls your weight and body composition data from Xiaomi Cloud (S400 scale) and sends it to Garmin Connect.</p>
        </div>
        <div className='flex flex-wrap'>
          <Link href="/cloud/xiaomiCloud" passHref className='m-5 w-full mr-auto ml-auto'>
            <button
              type="button"
              className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full'
            >  Mi Cloud Connector (S400)
            </button>
          </Link>
        </div>
      </div>
    </>
  )
}

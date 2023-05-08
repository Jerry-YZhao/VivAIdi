import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

function Home() {
  return (
    <React.Fragment>
      <Head>
        <title>vivAIldi</title>
      </Head>
      <div className='mt-1 w-full flex-wrap flex justify-center'>
        <Link href='/create'>
          <a className='btn-blue'>Create</a>
        </Link>
      </div>
    </React.Fragment>
  );
}

export default Home;

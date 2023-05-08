import Link from 'next/link';
import * as React from 'react';
import { WavRecorder } from "webm-to-wav-converter";
export default function Microphone(props) {
  const [running, setRunning] = React.useState(false)
  const wavRecorder = new WavRecorder();
  return (
    <div>
      {!running ? <div className='mt-1 w-full flex-wrap flex justify-center' onClick={() => {
        wavRecorder.start()
        console.log(wavRecorder)
        setRunning(true)
        }}>
          <button className='text-white font-bold px-4 py-2 rounded bg-green-600'>Start</button>
      </div> : 
      <div className='mt-1 w-full flex-wrap flex justify-center' onClick={() => {
        setRunning(false)
        wavRecorder.stop()
        const wavBlob = wavRecorder.getBlob(true);
        console.log(wavRecorder)
        // const uri = URL.createObjectURL(wavBlob);
        // props.setUri(uri)
        }}>
          <button className='text-white font-bold px-4 py-2 rounded bg-red-600'>Stop</button>
      </div>
      }
      <div className='mt-1 w-full flex-wrap flex justify-center' onClick={() => wavRecorder.download('myFile.wav',true, { sampleRate:  96000 })}>
          <button className='btn-blue'>Download</button>
      </div>
      <div className='mt-1 w-full flex-wrap flex justify-center' onClick={() => wavRecorder.download('myFile.wav',true, { sampleRate:  96000 })}>
            <Link href="/home">
                <a className='text-white font-bold px-4 py-2 rounded bg-black-600'>Home</a>
            </Link>
      </div>
    </div>
  );
}

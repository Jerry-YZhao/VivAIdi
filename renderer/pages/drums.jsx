import { useEffect, useState } from "react";
import Microphone from "./microphone";

function getDataFromAudio(){
    //analyser.fftSize = 2048;
    let freqByteData = new Uint8Array(analyser.fftSize/2);
    let timeByteData = new Uint8Array(analyser.fftSize/2);
    analyser.getByteFrequencyData(freqByteData);
    analyser.getByteTimeDomainData(timeByteData);
    return {f:freqByteData, t:timeByteData}; // array of all 1024 levels
}  

export default function Drums(){
    const [uri, setUri] = useState('');
    useEffect(() => {
        if (uri != ''){
            let audio = new Audio();
            audio.src = uri;
            audio.load();
            let audioContext = new AudioContext();
            let analyser = audioContext.createAnalyser();
            analyser.connect(audioContext.destination);
            let source = audioContext.createMediaElementSource(audio);
            source.connect(analyser)
            let freqByteData = new Uint8Array(analyser.fftSize/2);
            let timeByteData = new Uint8Array(analyser.fftSize/2);
            analyser.getByteFrequencyData(freqByteData);
            analyser.getByteTimeDomainData(timeByteData);
            console.log({f:freqByteData, t:timeByteData}); // array of all 1024 levels
        }
    }, [uri])
    return (
        <>
            <Microphone setUri={setUri}/>
        </>
    )
}
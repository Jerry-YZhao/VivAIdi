// 0. Install fingerpose npm install fingerpose
// 1. Add Use State
// 2. Import emojis and finger pose import * as fp from "fingerpose";
// 3. Setup hook and emoji object
// 4. Update detect function for gesture handling
// 5. Add emoji display to the screen

import React, { useRef, useState, useEffect } from "react";

// import logo from './logo.svg';
import * as tf from "@tensorflow/tfjs";
import * as handpose from "@tensorflow-models/handpose";
import Webcam from "react-webcam";
import { drawHand } from "../util/utilities";
import killas from "../util/killas";
import fist from "../util/fist";
import one from "../util/one";
import two from "../util/two";
import three from "../util/three";
import four from "../util/four";
import five from "../util/five";



import * as fp from "fingerpose";


function Camrecognize() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [gestureName, setGestureName] = useState(null);
  const [heightPCT, setHeightPCT] = useState(1);


  const runHandpose = async () => {
    const net = await handpose.load();
    console.log("[+] handpose is loaded")
    setInterval(() => { detect(net) }, 300)
  }

  const detect = async (net) => {
    if (typeof webcamRef.current !== "undefined" && webcamRef.current !== null && webcamRef.current.video.readyState === 4) {
      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      webcamRef.current.video.width = videoWidth;
      webcamRef.current.video.height = videoHeight;
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;

      const ctx = canvasRef.current.getContext("2d");

      const hand = await net.estimateHands(video);

      if (hand.length > 0) {
        setHeightPCT((videoHeight - (hand[0].boundingBox.bottomRight[1] + hand[0].boundingBox.topLeft[1]) / 2) / videoHeight)
        const GE = new fp.GestureEstimator(
          [
            fist,
            one,
            two,
            three,
            four,
            five,
          ]
        )

        const gesture = await GE.estimate(hand[0].landmarks, 8)

        if (gesture.gestures !== undefined && gesture.gestures.length > 0) {
          const confidence = gesture.gestures.map((prediction) => prediction.score);
          const maxConfidence = confidence.indexOf(Math.max.apply(null, confidence));
          setGestureName(gesture.gestures[maxConfidence].name);
        }

      }

      drawHand(hand, [videoWidth, videoHeight], ctx);

    }
  }

  runHandpose();

  return (
    <React.Fragment>
      <div style={{ position: 'relative' }}>
        {cameraOn && <Webcam
          ref={webcamRef}
          style={{
            position: "absolute",
            marginRight: "auto",
            left: 0,
            right: 0,
            textAlign: "center",
            zindex: 9,
            width: 640,
            height: 480,
          }
          }
          videoConstraints={{ facingMode: "user" }}
        />}

        {cameraOn && <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            marginLeft: "auto",
            marginRight: "auto",
            left: 0,
            right: 0,
            textAlign: "center",
            zindex: 9,
            width: 640,
            height: 480,
          }}
        />}

        {gestureName !== null ? (
          <img
            src={`/images/${gestureName}.png`}
            style={{
              position: "absolute",
              marginLeft: "auto",
              marginRight: "auto",
              left: '80%',
              top: 10,
              textAlign: "center",
              height: 80,
            }}
          />
        ) : (
          ""
        )}

        {/* {gestureName !== null ? (
          <div
            style={{
              position: 'absolute',
              zIndex: 10,
              top: 10,
              left: '90%',
              transform: 'translateX(-50%)',
              backgroundColor: 'white',
              borderRadius: '5px',
              padding: '10px',
              boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.3)',
            }}
          >
            <p style={{ color: "black", margin: 0 }}>{gestureName}</p>
          </div>
        ) : (
          ''
        )} */}

        <button className='btn-blue' onClick={() => setCameraOn(!cameraOn)} style={{
          position: 'absolute',
          top: 10,
          left: 10
        }}>
          {cameraOn ? "Turn Off Camera" : "Turn On Camera"}
        </button>

      </div>
    </React.Fragment>
  );
}

export default Camrecognize;
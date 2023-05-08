import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

const three = new GestureDescription('three');

three.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 2);
three.addCurl(Finger.Index, FingerCurl.HalfCurl, 2);
three.addCurl(Finger.Middle, FingerCurl.NoCurl, 2);
three.addCurl(Finger.Ring, FingerCurl.NoCurl, 2);
three.addCurl(Finger.Pinky, FingerCurl.NoCurl, 2);

export default three;
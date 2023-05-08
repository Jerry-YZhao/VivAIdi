import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

const fist = new GestureDescription('fist');

fist.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 2);
fist.addCurl(Finger.Index, FingerCurl.FullCurl, 2);
fist.addCurl(Finger.Middle, FingerCurl.FullCurl, 2);
fist.addCurl(Finger.Ring, FingerCurl.FullCurl, 2);
fist.addCurl(Finger.Pinky, FingerCurl.FullCurl, 2);

export default fist;
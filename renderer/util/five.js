import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

const five = new GestureDescription('five');

five.addCurl(Finger.Thumb, FingerCurl.NoCurl, 2);
five.addCurl(Finger.Index, FingerCurl.NoCurl, 2);
five.addCurl(Finger.Middle, FingerCurl.NoCurl, 2);
five.addCurl(Finger.Ring, FingerCurl.NoCurl, 2);
five.addCurl(Finger.Pinky, FingerCurl.NoCurl, 2);

export default five;
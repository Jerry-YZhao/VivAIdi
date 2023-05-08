import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

const four = new GestureDescription('four');

four.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 2);
four.addCurl(Finger.Index, FingerCurl.NoCurl, 2);
four.addCurl(Finger.Middle, FingerCurl.NoCurl, 2);
four.addCurl(Finger.Ring, FingerCurl.NoCurl, 2);
four.addCurl(Finger.Pinky, FingerCurl.NoCurl, 2);

export default four;
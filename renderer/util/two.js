import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

const two = new GestureDescription('two');

// // thumb
// two.addCurl(Finger.Index, FingerCurl.HalfCurl, 1);
// two.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 1);
// two.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 1);

// // index
// two.addCurl(Finger.Index, FingerCurl.NoCurl, 1);
// two.addDirection(Finger.Index, FingerDirection.VerticalUp, 1);
// two.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 1);
// two.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 1);

// // middle
// two.addCurl(Finger.Middle, FingerCurl.NoCurl, 1);
// two.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1);
// two.addDirection(Finger.Middle, FingerDirection.DiagonalUpRight, 1);
// two.addDirection(Finger.Middle, FingerDirection.DiagonalUpLeft, 1);

// // ring
// two.addCurl(Finger.Ring, FingerCurl.FullCurl, 1);
// two.addDirection(Finger.Ring, FingerDirection.VerticalUp, 1);
// two.addDirection(Finger.Ring, FingerDirection.VerticalDown, 1);

// // pinky
// two.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1);
// two.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 1);
// two.addDirection(Finger.Pinky, FingerDirection.VerticalDown, 1);

two.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 2);
two.addCurl(Finger.Index, FingerCurl.NoCurl, 2);
two.addCurl(Finger.Middle, FingerCurl.NoCurl, 2);
two.addCurl(Finger.Ring, FingerCurl.FullCurl, 2);
two.addCurl(Finger.Pinky, FingerCurl.FullCurl, 2);


export default two;
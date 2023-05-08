import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

const one = new GestureDescription('one');

// // thumb
// one.addCurl(Finger.Index, FingerCurl.HalfCurl, 1);
// one.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 1);
// one.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 1);

// // index
// one.addCurl(Finger.Index, FingerCurl.NoCurl, 1);
// one.addDirection(Finger.Index, FingerDirection.VerticalUp, 1);
// one.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 1);
// one.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 1);

// // middle
// one.addCurl(Finger.Middle, FingerCurl.FullCurl, 1);
// one.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1);
// one.addDirection(Finger.Middle, FingerDirection.VerticalDown, 1);

// // ring
// one.addCurl(Finger.Ring, FingerCurl.FullCurl, 1);
// one.addDirection(Finger.Ring, FingerDirection.VerticalUp, 1);
// one.addDirection(Finger.Ring, FingerDirection.VerticalDown, 1);

// // pinky
// one.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1);
// one.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 1);
// one.addDirection(Finger.Pinky, FingerDirection.VerticalDown, 1);

one.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 2);
one.addCurl(Finger.Index, FingerCurl.NoCurl, 2);
one.addCurl(Finger.Middle, FingerCurl.FullCurl, 2);
one.addCurl(Finger.Ring, FingerCurl.FullCurl, 2);
one.addCurl(Finger.Pinky, FingerCurl.FullCurl, 2);


export default one;
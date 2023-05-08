import * as fp from "fingerpose";

const killas = new fp.GestureDescription('killas');

killas.addCurl(fp.Finger.Thumb, fp.FingerCurl.HalfCurl, 0.5);
killas.addDirection(fp.Finger.Thumb, fp.FingerDirection.DiagonalUpLeft, 0.25);
killas.addDirection(fp.Finger.Thumb, fp.FingerDirection.DiagonalUpRight, 0.25);

killas.addCurl(fp.Finger.Index, fp.FingerCurl.NoCurl, 1);
killas.addCurl(fp.Finger.Index, fp.FingerDirection.VerticalUp, 1);

killas.addCurl(fp.Finger.Middle, fp.FingerCurl.NoCurl, 1);
killas.addCurl(fp.Finger.Middle, fp.FingerDirection.VerticalUp, 1);


killas.addCurl(fp.Finger.Ring, fp.FingerCurl.NoCurl);
killas.addCurl(fp.Finger.Ring, fp.FingerDirection.DiagonalUpLeft, 1);
killas.addCurl(fp.Finger.Ring, fp.FingerDirection.DiagonalUpRight, 1);

killas.addCurl(fp.Finger.Pinky, fp.FingerCurl.NoCurl);
killas.addCurl(fp.Finger.Pinky, fp.FingerDirection.DiagonalDownLeft, 1);
killas.addCurl(fp.Finger.Pinky, fp.FingerDirection.DiagonalDownRight, 1);


export default killas;
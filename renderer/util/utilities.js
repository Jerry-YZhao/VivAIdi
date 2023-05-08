const fingerJoints = {
    thumb: [0, 1, 2, 3, 4],
    indexFinger: [0, 5, 6, 7, 8],
    middleFinger: [0, 9, 10, 11, 12],
    ringFinger: [0, 13, 14, 15, 16],
    pinky: [0, 17, 18, 19, 20]
}

const meshColours = ["#a1a1a1", "#a6b6b6", "b1b1b1", "b6b6b6", "c1c1c1"]

export const drawHand = (predictions, ScreenDimension, ctx) => {
    if (predictions.length > 0) {


        predictions.forEach((prediction) => {
            // box: [bottom left X, bottom left Y, top right X, top right Y]
            const box = [...prediction.boundingBox.bottomRight, ...prediction.boundingBox.topLeft]
            const volume = (box[1] + box[3]) / 2;
            ctx.beginPath();
            ctx.moveTo(0, volume);
            ctx.lineTo(ScreenDimension[0], volume);
            ctx.strokeStyle = `rgb(95, 184, 94)`;
            ctx.lineWidth = 3;
            ctx.stroke();

            const landmarks = prediction.landmarks;
            var colourCounter = 0;

            for (const [finger, keys] of Object.entries(fingerJoints)) {
                for (var i = 0; i < keys.length - 1; i++) {
                    const firstPointIndex = fingerJoints[finger][i];
                    const secondPointIndex = fingerJoints[finger][i + 1];

                    ctx.beginPath();
                    ctx.moveTo(landmarks[firstPointIndex][0], landmarks[firstPointIndex][1]);
                    ctx.lineTo(landmarks[secondPointIndex][0], landmarks[secondPointIndex][1]);
                    ctx.strokeStyle = meshColours[colourCounter];
                    ctx.lineWidth = 4;
                    ctx.stroke();

                }
                colourCounter++;
            }

            landmarks.forEach((landmark) => {
                const x = landmark[0];
                const y = landmark[1];
                ctx.beginPath();
                ctx.arc(x, y, 7, 0, 3 * Math.PI);

                ctx.fillStyle = "indigo";
                ctx.fill();
            });
        });
    }
}


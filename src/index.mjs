import {spawn} from "child_process";
import {isValidBearerHeader, isValidTaskID, HTTPError, httpsGet, httpsPost} from "./common.mjs";

export async function submitImage(event, context) {
    if (!("x-authorization" in event.headers) || !event.isBase64Encoded) {
        throw new Error("Bad request");
    }

    let
        bearerHeader = event.headers["x-authorization"];

    if (!isValidBearerHeader(bearerHeader)) {
        throw new Error("Bad bearer token");
    }

    let
        inputImage = Buffer.from(event.body, 'base64'),

        // Scale down and crop center 1024x1024 square for DALL-E (it rejects other sizes)
        convert = spawn("/opt/bin/convert", [
            "jpeg:-", // JPEG from stdin
            "-thumbnail",
            "1024x1024^",
            "-gravity",
            "center",
            "-extent",
            "1024x1024",
            "png:-" // PNG to stdout
        ], {
            stdio: [
                "pipe",
                "pipe",
                process.stderr
            ]
        }),

        stdoutPromise = new Promise((resolve, reject) => {
            let
                chunks = [];

            convert.stdout.on('data', chunk => {
                chunks.push(chunk);
            });

            convert.stdout.on('end', () => resolve(Buffer.concat(chunks)));

            convert.stdout.on('error', reject);
        }),

        finishPromise = new Promise((resolve, reject) => {
            convert.on('close', code => {
                if (code === 0) {
                    resolve(0);
                } else {
                    reject("Returned exit code " + code);
                }
            });
        });

    convert.stdin.end(inputImage);

    return Promise.all([stdoutPromise, finishPromise])
        .then(results => results[0].toString("base64"))
        .then(outputImage => httpsPost(
            "https://labs.openai.com/api/labs/tasks",
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": bearerHeader
                },
                body: JSON.stringify({
                    "task_type": "variations",
                    "prompt": {
                        "batch_size": 5,
                        "image": outputImage
                    }
                })
            }
        ))
        .then(
            result => {
                console.log(JSON.stringify(result));
                return result;
            },
            err => {
                // Publish OpenAI error messages to the client (with 200 status) if available
                if (err instanceof HTTPError) {
                    let
                        errorJSON = err.resultBody;

                    if (errorJSON && "error" in errorJSON) {
                        return errorJSON;
                    }
                }

                throw err;
            }
        );
}

export async function pollTask(event, context) {
    if (!("x-authorization" in event.headers) || !("taskID" in event.pathParameters)) {
        throw new Error("Bad request");
    }

    let
        bearerHeader = event.headers["x-authorization"],
        taskID = event.pathParameters.taskID;

    if (!isValidBearerHeader(bearerHeader)) {
        throw new Error("Bad bearer token");
    }

    if (!isValidTaskID(taskID)) {
        throw new Error("Bad task ID");
    }

    return retry(
        () => httpsGet(
            "https://labs.openai.com/api/labs/tasks/" + taskID,
            {
                headers: {
                    "Authorization": bearerHeader
                }
            }
        ),
        1, // Allow a single retry
        5000
    );
}

export async function getImage(event, context) {
    if (!("imagePath" in event.pathParameters)) {
        throw new Error("Bad request");
    }

    let
        imageURL = "https://openailabsprodscus.blob.core.windows.net/" + event.pathParameters.imagePath + "?" + event.rawQueryString,

        webPInput = await httpsGet(imageURL),

        // Transcode to JPEG for Sony's benefit, add missing DALL-E watermark
        convert = spawn("/opt/bin/composite", [
            '-gravity',
            'SouthEast',
            __dirname + '/watermark.png',
            "webp:-", // WEBP from stdin
            "jpeg:-" // JPEG to stdout
        ], {
            stdio: [
                "pipe",
                "pipe",
                process.stderr
            ]
        }),

        stdoutPromise = new Promise((resolve, reject) => {
            let
                chunks = [];

            convert.stdout.on('data', chunk => {
                chunks.push(chunk);
            });

            convert.stdout.on('end', () => resolve(Buffer.concat(chunks)));

            convert.stdout.on('error', reject);
        }),

        finishPromise = new Promise((resolve, reject) => {
            convert.on('close', code => {
                if (code !== 0) {
                    reject("Returned exit code " + code);
                } else {
                    resolve(0)
                }
            });
        });

    convert.stdin.end(webPInput);

    let
        jpeg = (await Promise.all([stdoutPromise, finishPromise]))[0];

    return {
        'headers': { "Content-Type": "image/jpeg" },
        'statusCode': 200,
        'body': jpeg.toString("base64"),
        'isBase64Encoded': true
    };
}

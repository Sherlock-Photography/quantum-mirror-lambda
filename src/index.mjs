import {spawn} from "child_process";
import {isValidBearerHeader, HTTPError, httpsGet, httpsPostForm, isValidImageSize, isValidImageCount} from "./common.mjs";
import FormData from "form-data";

const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_IMAGE_SIZE = "1024x1024";

export async function submitImage(event, context) {
    if (!("x-authorization" in event.headers) || !event.isBase64Encoded) {
        throw new Error("Bad request");
    }

    let
        bearerHeader = event.headers["x-authorization"],
        imageSize = event.queryStringParameters.size || DEFAULT_IMAGE_SIZE,
        imageCount = (event.queryStringParameters.count | 0) || DEFAULT_BATCH_SIZE;

    if (!isValidBearerHeader(bearerHeader)) {
        throw new Error("Bad bearer token");
    }

    if (!isValidImageSize(imageSize)) {
        throw new Error("Bad image size");
    }

    if (!isValidImageCount(imageCount)) {
        throw new Error("Bad image count");
    }

    let
        inputImage = Buffer.from(event.body, 'base64'),

        // Scale down and crop center 1024x1024 square for DALL-E
        convert = spawn("/opt/bin/convert", [
            "jpeg:-", // JPEG from stdin
            "-thumbnail",
            "1024x1024^",
            "-gravity",
            "center",
            "-extent",
            "1024x1024",
            "-alpha",
            "off",
            "png:-" // PNG to stdout
        ], {
            stdio: [
                "pipe",
                "pipe",
                process.stderr
            ]
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

    let
        form = new FormData({maxDataSize: 4 * 1024 * 1024});

    form.append("n", "" + imageCount);
    form.append("size", imageSize);
    form.append("response_format", "url");
    form.append("user", "1"); // We only have a single user per API key, so any ID will do here
    form.append("image", convert.stdout, {filename: "image", contentType: "image/png"});

    return Promise.all([
        httpsPostForm(
            "https://api.openai.com/v1/images/variations",
            {
                headers: {
                    "Authorization": bearerHeader
                },
                form
            }
        ),
        finishPromise
    ])
        .then(
            ([httpResult, exitCodeResult]) => httpResult,
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

export async function getImage(event, context) {
    let
        matches = event.rawPath.match(/^\/getImage\/(.+)/);

    if (!matches) {
        throw new Error("Bad request");
    }

    let
        // Hardcode the domain name so caller can't use us to proxy to arbitrary websites:
        imageURL = "https://oaidalleapiprodscus.blob.core.windows.net/" + matches[1] + "?" + event.rawQueryString,

        webPInput = await httpsGet(imageURL),

        // Transcode to JPEG to reduce download time
        convert = spawn("/opt/bin/convert", [
            "png:-", // PNG from stdin
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

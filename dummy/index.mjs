import fs from "fs";
import {isValidBearerHeader, isValidTaskID} from "../src/common.mjs";
import taskPendingJSON from "./task-pending.json" assert {type: "json"};
import taskCompleteJSON from "./task-complete.json" assert {type: "json"};

export async function submitImage(event, context) {
    if (!("x-authorization" in event.headers) || !event.isBase64Encoded) {
        throw new Error("Bad request");
    }

    let
        bearerHeader = event.headers["x-authorization"];

    if (!isValidBearerHeader(bearerHeader)) {
        throw new Error("Bad bearer token");
    }

    console.log("Ignoring uploaded image of size " + Buffer.from(event.body, 'base64').length);

    return taskPendingJSON;
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

    if (Math.random() < 0.5) {
        return taskCompleteJSON;
    } else {
        return taskPendingJSON;
    }
}

export async function getImage(event, context) {
    if (!("imagePath" in event.pathParameters)) {
        throw new Error("Bad request");
    }

    let
        imageIndex = parseInt(/generation-abcdefghijklmnopqrstuvw(\d+)/.exec(event.pathParameters.imagePath)[1], 10);

    return {
        'headers': { "Content-Type": "image/jpeg" },
        'statusCode': 200,
        'body': fs.readFileSync(__dirname + "/example-" + imageIndex + ".jpg").toString("base64"),
        'isBase64Encoded': true
    };
}

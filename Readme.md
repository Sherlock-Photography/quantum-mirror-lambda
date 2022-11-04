# Quantum Mirror Lambda

This is the backend service for the [Quantum Mirror app](https://github.com/Sherlock-Photography/QuantumMirror)
that forwards requests to OpenAI's DALL-E 2 endpoints.

A TLS 1.0 endpoint is deployed to support Sony's ancient TLS stack, and a default Cloudfront domain is used rather than 
a custom domain name so that Android 2.3.7's lack of SNI support doesn't cause an issue.

The Sony camera supplies the OpenAI account credentials in X-Authorization headers, so this service doesn't contain
any credentials itself.

## Deploy me

You can deploy this service with Serverless like so, just install Node.JS and configure the AWS SDK on your machine
first:

```bash
git clone https://github.com/Sherlock-Photography/quantum-mirror-lambda.git
cd quantum-mirror-lambda
npm install
./node_modules/.bin/sls deploy --verbose
```

Three Lambdas and a CloudFront distribution will be deployed to your AWS account, and it'll print out a list of outputs.
Look for the one labelled "EndpointForCameraTokenTxt":

    Stack Outputs:
        ...
        EndpointForCameraTokenTxt: https://xxxxxxxx.cloudfront.net/
        ...
   
Copy that address and put it into the "endpoint" line of the AI-SET.TXT file on your camera, e.g.:

    api-key=sk-xxx
    endpoint=https://xxxxxxxx.cloudfront.net/

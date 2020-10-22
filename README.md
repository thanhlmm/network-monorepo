# streamr-network
 ![Travis](https://travis-ci.com/streamr-dev/network.svg?token=qNNVCnYJo1fz18VTNpPZ&branch=master)

> Peer-to-peer-based publish-subscribe system for real-time and persisted data.

This package contains an extendable implementation of the server-side
[Streamr protocol](https://github.com/streamr-dev/streamr-specs/blob/master/PROTOCOL.md) logic written in Node.js.
The package mostly acts as a library for other packages wishing to implement a broker node, but additionally
provides a tracker executable, and a stripped-down network node executable of its own.


The main executable for running a broker node in the Streamr Network resides in the
[streamr-broker](https://github.com/streamr-dev/broker) package. Although _streamr-network_ contains a
fully-operational minimal network node implementation, we recommend running the node executable found in
_streamr-broker_ as it includes useful client-facing features for interacting with the Streamr Network.

The [wiki](https://github.com/streamr-dev/network/wiki) outlines the technical and architectural
decisions of the project. It provides thorough explanations of some the more involved features.
A glossary is also included.

## Table of Contents
- [Installation](#installation)
- [Architectural decisions](https://github.com/streamr-dev/network/wiki)
- [Examples](#examples)
- [Development](#development)
- [Releasing](#releasing)

## Installation

Prerequisites are [Node.js](https://nodejs.org/) `14.x` and npm version `>=6.14`.

You can install streamr-network as a library in your project using npm:

```bash
npm install streamr-network --save
```

To install streamr-network system-wide:
```bash
npm install streamr-network --global
```

## Examples

Check the [examples folder](./examples) for examples of using the network node in different settings.

## Development

Install dependencies:

    npm ci

Run the tests:

    npm run test

Run an example network of 100 nodes (locally):

    npm run network

We use [eslint](https://github.com/eslint/eslint) for code formatting:

    npm run eslint

Code coverage:

    npm run coverage

### Debugging

To get all debug messages:

    LOG_LEVEL=debug

... or adjust debugging to desired level:

    LOG_LEVEL=[debug|info|warn|error]

### Generating fixture self-signed certificate
To regenerate self signed certificate in `./test/fixtures` run:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36500 -nodes -subj "/CN=localhost"
```

## Publishing

Publishing to NPM is automated via Github Actions. Follow the steps below to publish `latest` or `beta`.

### Publishing `latest`:
1. `git co master && git pull`
2. Update version with either `npm version [patch|minor|major]`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created.
3. `git push --follow-tags`
4. Wait for Github Actions to run tests
5. If tests passed, Github Actions will publish the new version to NPM

### Publishing `beta`:
1. Update version with either `npm version [prepatch|preminor|premajor] --preid=beta`. Use semantic versioning
https://semver.org/. Files package.json and package-lock.json will be automatically updated, and an appropriate git commit and tag created.
2. `git push --follow-tags`
3. Wait for Github Actions to run tests
4. If tests passed, Github Actions will publish the new version to NPM

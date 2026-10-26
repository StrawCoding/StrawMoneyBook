fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android production_review

```sh
[bundle exec] fastlane android production_review
```

Submit phone + wear AABs to Google Play production (phone=production, wear=wear:production)

### android closed_testing

```sh
[bundle exec] fastlane android closed_testing
```

Publish phone + wear AABs to Google Play testing tracks (channel from play-testing-channel.json: internal|closed)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).

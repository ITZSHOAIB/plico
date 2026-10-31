# Plico

Plico turns a folder of Markdown instructions, skills, TypeScript tools, and config into a runnable, inspectable agent app. This glossary covers the language of that project model and its runtime.

## Language

**Terminal run**:
A run that has finished for good, as completed, failed, or cancelled. A waiting run is not a terminal run.
_Avoid_: Ended run, closed run

**Waiting run**:
A run that has stopped executing because it needs something from outside, recorded durably so no process has to hold it. The reason it is waiting is recorded separately from its status.
_Avoid_: Blocked run, paused run, suspended run

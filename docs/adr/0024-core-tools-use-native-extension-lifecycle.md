# Core tools use the native extension lifecycle

The core toolset uses Pi's public registration, dispatch, and lifecycle without changes to Pi's source. Live commands, execution cells, and temporary stored values belong to the active extension session; normal session shutdown or reload stops live work and clears temporary state, while file changes and retained history remain. This keeps execution ownership within Pi and accepts that live work does not survive session replacement.

# Homologo - Source Files

These are the source files for your Tunecamp site. You can use them to rebuild with the CLI.

## How to rebuild with CLI

1. Install Tunecamp: `npm install -g tunecamp`
2. Navigate to the src folder: `cd src`
3. Build: `tunecamp build . -o ../public`

## Structure

```
src/
├── catalog.yaml      # Site configuration
├── artist.yaml       # Artist information
└── releases/
    └── catarifrangente/
        ├── release.yaml
        ├── cover.*
        └── tracks/
```

## Documentation

For more information: https://github.com/scobru/tunecamp

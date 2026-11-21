#!/bin/sh
# Download all annotators' answers from the live site. Add "?history=1" for every individual save.
cd "$(dirname "$0")" && curl -s -H "Authorization: Bearer $(cat .export-token)" "https://sparql-audit.vercel.app/api/export$1" > "answers-$(date +%Y%m%d-%H%M).json" && ls -1t answers-*.json | head -1

#!/bin/bash

trap 'kill 0' EXIT

cd "$(dirname "$0")/server" && npm run dev &
cd "$(dirname "$0")/web" && npm run dev &

wait

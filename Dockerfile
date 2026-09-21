# The whole thing in one container: the game and the friends server.
FROM node:22-alpine

WORKDIR /app
COPY . .

ENV PORT=8080
ENV DATA_FILE=/data/players.json

# Names and friend lists live here. Mount a volume at /data on any host with a
# throwaway filesystem, or they go when the machine is recycled.
VOLUME /data

EXPOSE 8080
CMD ["node", "server/server.js"]

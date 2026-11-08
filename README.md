squish-app — Docker Image
A containerized static web application powered by Nginx and Docker.
Run it instantly (no setup)
This project is published on Docker Hub. You can launch it without installing anything except Docker:
docker run -d -p 8080:80 mahamfatima07/squish-app:v1
Then open http://localhost:8080 in your browser.
How it works
The app is a static website — index.html, style.css and script.js
The Dockerfile uses the lightweight nginx:alpine image
The static files are copied into Nginx's web root (/usr/share/nginx/html/)
Nginx serves the site on port 80 inside the container
Build it yourself
docker build -t squish-app .
docker run -d -p 8080:80 squish-app
Files
File
Purpose
Dockerfile
Builds the image from nginx:alpine and copies the site files in
index.html
Page structure
style.css
Styling
script.js
Behaviour

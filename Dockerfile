# Use lightweight Nginx web server
FROM nginx:alpine

# Copy your static files into the default Nginx web root directory
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/

# Expose port 80 for web traffic
EXPOSE 80

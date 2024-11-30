FROM amazonlinux:2

# Install curl
RUN yum install -y curl

# Copy the configuration file into the image
COPY config.json /config.json

RUN cat config.json

CMD ["cat", "/config.json"]
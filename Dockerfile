# VASTUAALAY 3D V7: original PHP app + its Python OpenCV/Tesseract scanner.
FROM php:8.3-apache-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv tesseract-ocr tesseract-ocr-eng \
      libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
COPY python/requirements-deploy.txt /tmp/requirements-deploy.txt
RUN /opt/venv/bin/python -m pip install --no-cache-dir --prefer-binary \
    -r /tmp/requirements-deploy.txt \
    && rm -f /tmp/requirements-deploy.txt

COPY index.php health.php /var/www/html/
COPY api/ /var/www/html/api/
COPY assets/ /var/www/html/assets/
COPY python/scan_floorplan.py /var/www/html/python/scan_floorplan.py
COPY uploads/.htaccess /var/www/html/uploads/.htaccess
COPY storage/.htaccess /var/www/html/storage/.htaccess
COPY docker/vastuaalay-apache.conf /etc/apache2/conf-available/vastuaalay.conf
COPY docker/start.sh /usr/local/bin/start-vastuaalay
COPY docker/php-vastuaalay.ini /usr/local/etc/php/conf.d/vastuaalay.ini

RUN a2enmod headers && a2enconf vastuaalay \
    && mkdir -p /var/www/html/uploads /var/www/html/storage \
    && chown -R www-data:www-data /var/www/html/uploads /var/www/html/storage \
    && chmod 750 /var/www/html/uploads /var/www/html/storage \
    && chmod +x /usr/local/bin/start-vastuaalay

EXPOSE 10000
CMD ["/usr/local/bin/start-vastuaalay"]

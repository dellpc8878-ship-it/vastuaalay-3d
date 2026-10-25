<?php
// Render Docker environment: Python interpreter inside container.
// Local Windows XAMPP uses a different config and is NOT changed by this deploy copy.
const VASTU_PYTHON = '/opt/venv/bin/python';
const VASTU_UPLOAD_LIMIT = 12582912; // 12 MiB

"""S3-compatible Object Storage Service for LingoStream.

Supports MinIO (local Docker) and cloud S3-compatible providers (Cloudflare R2, AWS S3)
with zero code changes — configured purely via environment variables.
"""
import io
import logging
from typing import BinaryIO, Optional
import boto3
from botocore.exceptions import ClientError

from config.settings import settings

logger = logging.getLogger(__name__)


class StorageService:
    """Manages file storage in MinIO / S3."""

    def __init__(self):
        self.endpoint_url = settings.S3_ENDPOINT_URL
        self.access_key = settings.S3_ACCESS_KEY_ID
        self.secret_key = settings.S3_SECRET_ACCESS_KEY
        self.bucket_name = settings.S3_BUCKET_NAME
        self.region = settings.S3_REGION

        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region,
            )
        return self._client

    def upload_file(
        self,
        file_obj: BinaryIO,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a file stream to S3 / MinIO and return its storage key."""
        client = self._get_client()
        try:
            client.upload_fileobj(
                file_obj,
                self.bucket_name,
                object_key,
                ExtraArgs={"ContentType": content_type},
            )
            logger.info("Successfully uploaded %s to %s", object_key, self.bucket_name)
            return object_key
        except ClientError as exc:
            logger.error("Failed to upload %s: %s", object_key, exc)
            raise

    def upload_bytes(
        self,
        data: bytes,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload raw bytes to S3 / MinIO."""
        return self.upload_file(io.BytesIO(data), object_key, content_type)

    def get_file_bytes(self, object_key: str) -> bytes:
        """Download file from S3 / MinIO and return bytes."""
        client = self._get_client()
        try:
            response = client.get_object(Bucket=self.bucket_name, Key=object_key)
            return response["Body"].read()
        except ClientError as exc:
            logger.error("Failed to read %s: %s", object_key, exc)
            raise

    def delete_file(self, object_key: str) -> None:
        """Delete an object from S3 / MinIO."""
        client = self._get_client()
        try:
            client.delete_object(Bucket=self.bucket_name, Key=object_key)
            logger.info("Deleted %s from %s", object_key, self.bucket_name)
        except ClientError as exc:
            logger.warning("Failed to delete %s: %s", object_key, exc)


storage_service = StorageService()

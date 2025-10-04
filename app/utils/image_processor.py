"""Image processing utilities for compression, validation, and thumbnail generation."""
import io
import logging
from typing import Tuple, Optional
from PIL import Image
from enum import Enum

logger = logging.getLogger(__name__)


class ImageFormat(str, Enum):
    """Supported image formats."""
    PNG = "PNG"
    JPEG = "JPEG"
    WEBP = "WEBP"


class ImageQuality(str, Enum):
    """Image quality presets."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Quality settings for compression
QUALITY_SETTINGS = {
    ImageQuality.HIGH: {"jpeg": 95, "webp": 90, "png_compress": 6},
    ImageQuality.MEDIUM: {"jpeg": 85, "webp": 80, "png_compress": 7},
    ImageQuality.LOW: {"jpeg": 75, "webp": 70, "png_compress": 9},
}

# Maximum file sizes (in bytes)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_THUMBNAIL_SIZE = 256 * 256  # 256x256 pixels


class ImageProcessor:
    """Image processing utilities."""

    @staticmethod
    def validate_image(image_data: bytes, max_size: int = MAX_FILE_SIZE) -> Tuple[bool, Optional[str]]:
        """Validate image data.

        Args:
            image_data: Image bytes
            max_size: Maximum allowed file size

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Check file size
            if len(image_data) > max_size:
                return False, f"Image size exceeds maximum allowed size of {max_size / (1024*1024):.1f} MB"

            # Try to open image
            image = Image.open(io.BytesIO(image_data))

            # Verify format
            if image.format not in ["PNG", "JPEG", "WEBP"]:
                return False, f"Unsupported image format: {image.format}. Supported: PNG, JPEG, WebP"

            # Check if image is corrupted
            image.verify()

            return True, None

        except Exception as e:
            logger.error(f"Image validation error: {str(e)}")
            return False, f"Invalid image data: {str(e)}"

    @staticmethod
    def get_image_info(image_data: bytes) -> dict:
        """Get image information.

        Args:
            image_data: Image bytes

        Returns:
            Dictionary with image information
        """
        try:
            image = Image.open(io.BytesIO(image_data))

            return {
                "format": image.format,
                "mode": image.mode,
                "width": image.width,
                "height": image.height,
                "size_bytes": len(image_data),
                "size_mb": round(len(image_data) / (1024 * 1024), 2),
            }

        except Exception as e:
            logger.error(f"Error getting image info: {str(e)}")
            return {}

    @staticmethod
    def compress_image(
        image_data: bytes,
        quality: ImageQuality = ImageQuality.HIGH,
        output_format: Optional[ImageFormat] = None,
        max_dimension: Optional[int] = None
    ) -> Tuple[bytes, str]:
        """Compress image with quality settings.

        Args:
            image_data: Original image bytes
            quality: Quality preset (high, medium, low)
            output_format: Output format (None = keep original)
            max_dimension: Maximum width or height (resize if larger)

        Returns:
            Tuple of (compressed_bytes, content_type)
        """
        try:
            image = Image.open(io.BytesIO(image_data))

            # Convert RGBA to RGB for JPEG
            if output_format == ImageFormat.JPEG and image.mode in ("RGBA", "LA", "P"):
                # Create white background
                background = Image.new("RGB", image.size, (255, 255, 255))
                if image.mode == "P":
                    image = image.convert("RGBA")
                background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
                image = background

            # Resize if needed
            if max_dimension and (image.width > max_dimension or image.height > max_dimension):
                image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
                logger.info(f"Resized image to {image.width}x{image.height}")

            # Determine output format
            fmt = output_format.value if output_format else image.format
            if fmt not in ["PNG", "JPEG", "WEBP"]:
                fmt = "PNG"

            # Get quality settings
            quality_config = QUALITY_SETTINGS[quality]

            # Compress and save
            output = io.BytesIO()

            if fmt == "JPEG":
                image.save(
                    output,
                    format="JPEG",
                    quality=quality_config["jpeg"],
                    optimize=True,
                    progressive=True
                )
                content_type = "image/jpeg"

            elif fmt == "WEBP":
                image.save(
                    output,
                    format="WEBP",
                    quality=quality_config["webp"],
                    method=6  # Better compression
                )
                content_type = "image/webp"

            else:  # PNG
                image.save(
                    output,
                    format="PNG",
                    optimize=True,
                    compress_level=quality_config["png_compress"]
                )
                content_type = "image/png"

            compressed_data = output.getvalue()

            # Log compression stats
            original_size = len(image_data)
            compressed_size = len(compressed_data)
            reduction = ((original_size - compressed_size) / original_size) * 100

            logger.info(
                f"Compressed image: {original_size/1024:.1f}KB -> "
                f"{compressed_size/1024:.1f}KB ({reduction:.1f}% reduction)"
            )

            return compressed_data, content_type

        except Exception as e:
            logger.error(f"Error compressing image: {str(e)}")
            raise

    @staticmethod
    def generate_thumbnail(
        image_data: bytes,
        size: Tuple[int, int] = (256, 256),
        quality: ImageQuality = ImageQuality.MEDIUM
    ) -> Tuple[bytes, str]:
        """Generate thumbnail from image.

        Args:
            image_data: Original image bytes
            size: Thumbnail size (width, height)
            quality: Quality preset

        Returns:
            Tuple of (thumbnail_bytes, content_type)
        """
        try:
            image = Image.open(io.BytesIO(image_data))

            # Convert to RGB if needed (for JPEG)
            if image.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", image.size, (255, 255, 255))
                if image.mode == "P":
                    image = image.convert("RGBA")
                if image.mode in ("RGBA", "LA"):
                    background.paste(image, mask=image.split()[-1])
                else:
                    background.paste(image)
                image = background

            # Generate thumbnail (maintains aspect ratio)
            image.thumbnail(size, Image.Resampling.LANCZOS)

            # Save as JPEG for smaller file size
            output = io.BytesIO()
            quality_config = QUALITY_SETTINGS[quality]

            image.save(
                output,
                format="JPEG",
                quality=quality_config["jpeg"],
                optimize=True
            )

            thumbnail_data = output.getvalue()

            logger.info(f"Generated thumbnail: {image.width}x{image.height}, {len(thumbnail_data)/1024:.1f}KB")

            return thumbnail_data, "image/jpeg"

        except Exception as e:
            logger.error(f"Error generating thumbnail: {str(e)}")
            raise

    @staticmethod
    def optimize_for_web(image_data: bytes) -> Tuple[bytes, bytes, dict]:
        """Optimize image for web delivery.

        Creates both optimized full-size image and thumbnail.

        Args:
            image_data: Original image bytes

        Returns:
            Tuple of (optimized_image, thumbnail, metadata)
        """
        try:
            # Get original info
            info = ImageProcessor.get_image_info(image_data)

            # Compress full image
            optimized_image, content_type = ImageProcessor.compress_image(
                image_data,
                quality=ImageQuality.HIGH,
                max_dimension=2048  # Max 2048px for web
            )

            # Generate thumbnail
            thumbnail, thumb_content_type = ImageProcessor.generate_thumbnail(image_data)

            # Create metadata
            metadata = {
                "original_size_bytes": info.get("size_bytes", 0),
                "optimized_size_bytes": len(optimized_image),
                "thumbnail_size_bytes": len(thumbnail),
                "original_dimensions": f"{info.get('width')}x{info.get('height')}",
                "compression_ratio": round(
                    len(optimized_image) / info.get("size_bytes", 1), 2
                ),
                "content_type": content_type,
                "thumbnail_content_type": thumb_content_type,
            }

            logger.info(f"Optimized for web: {metadata}")

            return optimized_image, thumbnail, metadata

        except Exception as e:
            logger.error(f"Error optimizing for web: {str(e)}")
            raise

    @staticmethod
    def convert_format(
        image_data: bytes,
        output_format: ImageFormat,
        quality: ImageQuality = ImageQuality.HIGH
    ) -> Tuple[bytes, str]:
        """Convert image to different format.

        Args:
            image_data: Original image bytes
            output_format: Desired output format
            quality: Quality preset

        Returns:
            Tuple of (converted_bytes, content_type)
        """
        return ImageProcessor.compress_image(
            image_data,
            quality=quality,
            output_format=output_format
        )

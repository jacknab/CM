"""
OpenAI service for parsing salon menus using GPT-4o with vision capabilities.
Integrates with booking_menu_processor.py for structured prompts and schema.
"""
import base64
import os
from typing import Union, List
from booking_menu_processor import (
    get_nail_menu_parser_instructions,
    get_json_response_schema,
    parse_openai_response
)
from openai import OpenAI

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def _encode_image_to_base64(image_bytes: bytes) -> str:
    """Encode image bytes to base64 string."""
    return base64.b64encode(image_bytes).decode('utf-8')

def _get_image_mime_type(file_name: str) -> str:
    """Determine MIME type from file extension."""
    ext = file_name.lower().split('.')[-1] if '.' in file_name else ''
    mime_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    }
    return mime_types.get(ext, 'image/jpeg')  # default to jpeg

def parse_menu_from_image(image_bytes: bytes, file_name: str = "menu.jpg") -> dict:
    """
    Parse a salon menu from image bytes using GPT-4o vision.
    
    Args:
        image_bytes: Raw image bytes
        file_name: Original filename (used for MIME type detection)
        
    Returns:
        Parsed menu data as dictionary matching the JSON schema
    """
    # Encode image
    base64_image = _encode_image_to_base64(image_bytes)
    mime_type = _get_image_mime_type(file_name)
    
    # Prepare messages
    messages = [
        {
            "role": "system",
            "content": get_nail_menu_parser_instructions()
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{base64_image}"
                    }
                }
            ]
        }
    ]
    
    # Call OpenAI API with structured output
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format=get_json_response_schema(),
            max_tokens=4096
        )
        
        # Extract and parse the response
        response_text = response.choices[0].message.content
        return parse_openai_response(response_text)
        
    except Exception as e:
        return {
            "error": f"OpenAI API error: {str(e)}",
            "Manicures": [],
            "Pedicures": [],
            "Full Sets (Extensions)": [],
            "Overlays & Structure": [],
            "Refills & Maintenance": [],
            "Nail Art & Add-Ons": []
        }

def parse_menu_from_pdf(pdf_bytes: bytes, file_name: str = "menu.pdf") -> dict:
    """
    Parse a salon menu from PDF bytes by converting pages to images and using GPT-4o vision.
    
    Args:
        pdf_bytes: Raw PDF bytes
        file_name: Original filename
        
    Returns:
        Parsed menu data as dictionary matching the JSON schema
    """
    try:
        # Try to import pdf2image - if not available, fall back to alternative approach
        from pdf2image import convert_from_bytes
        
        # Convert PDF pages to images
        images = convert_from_bytes(pdf_bytes, fmt='jpeg')
        
        # Encode all images to base64
        image_contents = []
        for img in images:
            # Convert PIL image to bytes
            from io import BytesIO
            img_byte_arr = BytesIO()
            img.save(img_byte_arr, format='JPEG')
            img_byte_arr = img_byte_arr.getvalue()
            
            base64_image = _encode_image_to_base64(img_byte_arr)
            image_contents.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64:{base64_image}"
                }
            })
        
        # Prepare messages with all images
        messages = [
            {
                "role": "system",
                "content": get_nail_menu_parser_instructions()
            },
            {
                "role": "user",
                "content": image_contents
            }
        ]
        
        # Call OpenAI API with structured output
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format=get_json_response_schema(),
            max_tokens=4096
        )
        
        # Extract and parse the response
        response_text = response.choices[0].message.content
        return parse_openai_response(response_text)
        
    except ImportError:
        # Fallback: if pdf2image is not available, use OpenAI Files API method
        return _parse_menu_via_files_api(pdf_bytes, file_name)
    except Exception as e:
        return {
            "error": f"PDF processing error: {str(e)}",
            "Manicures": [],
            "Pedicures": [],
            "Full Sets (Extensions)": [],
            "Overlays & Structure": [],
            "Refills & Maintenance": [],
            "Nail Art & Add-Ons": []
        }

def _parse_menu_via_files_api(pdf_bytes: bytes, file_name: str) -> dict:
    """
    Fallback method using OpenAI Files API for PDF (similar to existing TypeScript implementation).
    """
    try:
        # Upload PDF to OpenAI Files API
        file_response = client.files.create(
            file=(file_name, pdf_bytes, "application/pdf"),
            purpose="assistants"
        )
        
        # Prepare messages with file reference
        messages = [
            {
                "role": "system",
                "content": get_nail_menu_parser_instructions()
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "file",
                        "file": {
                            "file_id": file_response.id
                        }
                    }
                ]
            }
        ]
        
        # Call OpenAI API with structured output
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format=get_json_response_schema(),
            max_tokens=4096
        )
        
        # Extract and parse the response
        response_text = response.choices[0].message.content
        result = parse_openai_response(response_text)
        
        # Clean up uploaded file
        try:
            client.files.delete(file_response.id)
        except Exception:
            pass  # Ignore cleanup errors
            
        return result
        
    except Exception as e:
        return {
            "error": f"Files API error: {str(e)}",
            "Manicures": [],
            "Pedicures": [],
            "Full Sets (Extensions)": [],
            "Overlays & Structure": [],
            "Refills & Maintenance": [],
            "Nail Art & Add-Ons": []
        }

def parse_menu_file(file_bytes: bytes, file_name: str) -> dict:
    """
    Main entry point to parse a menu file (image or PDF).
    
    Args:
        file_bytes: Raw file bytes
        file_name: Original filename (used to determine type)
        
    Returns:
        Parsed menu data as dictionary
    """
    # Determine file type by extension
    ext = file_name.lower().split('.')[-1] if '.' in file_name else ''
    
    if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
        return parse_menu_from_image(file_bytes, file_name)
    elif ext == 'pdf':
        return parse_menu_from_pdf(file_bytes, file_name)
    else:
        return {
            "error": f"Unsupported file type: {ext}",
            "Manicures": [],
            "Pedicures": [],
            "Full Sets (Extensions)": [],
            "Overlays & Structure": [],
            "Refills & Maintenance": [],
            "Nail Art & Add-Ons": []
        }

# Example usage (for testing)
if __name__ == "__main__":
    # This would be used in an actual service/controller
    print("OpenAI service module for menu parsing")
    print("Usage: parse_menu_file(file_bytes, file_name)")
// Dependencies
const { Buffer } = require("node:buffer");

// Raw image input => Blob
function encodeImage(img_b64) {
	if (img_b64 === null || img_b64 === undefined) return null;
	const buffer = Buffer.from(img_b64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
	if (buffer.length > (500 * 1024)) return null; // too large (500KB = 500B * 1240)
	return buffer;
}
// Blob => Raw image output
function convertEncodedImage(img_blob) {
	try {
		return (img_blob === null || img_blob === undefined) ? null : `data:image/jpeg;base64,${img_blob.toString('base64')}`;
		
	} catch (err) {
		return img_blob;
	}
}

// ----- Export -----
module.exports = {encodeImage, convertEncodedImage};
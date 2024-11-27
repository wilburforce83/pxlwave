// Co ordinates to Maidenhead Grid Squares

function maidenheadToLatLon(grid) {
    // Convert grid to uppercase to standardize
    grid = grid.toUpperCase();
    
    // Initialize longitude and latitude
    let lon = -180;
    let lat = -90;
    
    // Grid square sizes at each level
    const lon_sizes = [20, 2, 5 / 60, (5 / 60) / 24]; // degrees
    const lat_sizes = [10, 1, 2.5 / 60, (2.5 / 60) / 24]; // degrees
    
    let i = 0; // index for grid string
    let level = 0; // level of precision
    
    while (i + 1 <= grid.length && level < lon_sizes.length) {
        let lon_size = lon_sizes[level];
        let lat_size = lat_sizes[level];
        
        if (level % 2 === 0) {
            // Process letter pairs
            let lon_char = grid.charAt(i);
            let lat_char = grid.charAt(i + 1);
            let lon_value, lat_value;

            // Convert letters to numerical values
            lon_value = lon_char.charCodeAt(0) - 'A'.charCodeAt(0);
            lat_value = lat_char.charCodeAt(0) - 'A'.charCodeAt(0);

            lon += lon_value * lon_size;
            lat += lat_value * lat_size;
        } else {
            // Process digit pairs
            let lon_digit = parseInt(grid.charAt(i), 10);
            let lat_digit = parseInt(grid.charAt(i + 1), 10);

            lon += lon_digit * lon_size;
            lat += lat_digit * lat_size;
        }
        i += 2;
        level += 1;
    }
    
    // Adjust for the center of the grid square
    let last_lon_size = lon_sizes[Math.min(level - 1, lon_sizes.length - 1)];
    let last_lat_size = lat_sizes[Math.min(level - 1, lat_sizes.length - 1)];
    lon += last_lon_size / 2;
    lat += last_lat_size / 2;
    
    return { lon: lon, lat: lat };
}

/* Example usage:

let gridSquare = "FN20";
let coordinates = maidenheadToLatLon(gridSquare);
console.log(`Longitude: ${coordinates.lon}, Latitude: ${coordinates.lat}`);

*/


function latlonToMaidenhead(lat, lon, precision = 6) {
    // Validate the precision
    if (precision < 2 || precision > 8 || precision % 2 !== 0) {
        throw new Error('Precision must be an even number between 2 and 8');
    }
    
    // Ensure latitude and longitude are valid
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error('Latitude must be between -90 and 90, and longitude between -180 and 180');
    }

    // Shift the coordinates to positive values
    let adjLat = lat + 90;
    let adjLon = lon + 180;

    let maidenhead = '';

    // Grid square sizes at each level
    const lonSizes = [20, 2, 1 / 12, (1 / 12) / 10]; // degrees
    const latSizes = [10, 1, 1 / 24, (1 / 24) / 10]; // degrees

    // Characters used in grid encoding
    const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';

    for (let i = 0; i < precision / 2; i++) {
        let lonSize = lonSizes[i];
        let latSize = latSizes[i];

        let lonIndex = Math.floor(adjLon / lonSize);
        let latIndex = Math.floor(adjLat / latSize);

        if (i % 2 === 0) {
            // Even index levels use letters
            maidenhead += upperChars.charAt(lonIndex % 18);
            maidenhead += upperChars.charAt(latIndex % 18);
        } else {
            // Odd index levels use digits
            maidenhead += digits.charAt(lonIndex % 10);
            maidenhead += digits.charAt(latIndex % 10);
        }

        // Subtract the used portion to prepare for the next level
        adjLon -= lonIndex * lonSize;
        adjLat -= latIndex * latSize;
    }

    return maidenhead;
}

/* Example usage:

let latitude = 40.7128;  // New York City latitude
let longitude = -74.0060; // New York City longitude
let gridSquare = latlonToMaidenhead(latitude, longitude, 6);
console.log(`Maidenhead Grid Square: ${gridSquare}`); // Outputs: Maidenhead Grid Square: FN30as

*/

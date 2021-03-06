
function storeState(dataGrid, imWidth, imHeight){

  let pI = 0,
      pR = 0,
      pS = 0

  for (let y = 0; y < imHeight; y++) {
    for (let x = 0; x < imWidth; x++) {
      let pos = (y * imWidth + x) * 4 + 0; // position in buffer based
        pI += dataGrid[pos+1]
        pR += dataGrid[pos+0]
        pS += dataGrid[pos+2]
    }
  }
  return [pI, pR, pS]
}//storeState

function convertDatatoImage(data){

  const [matrixData, extentLon, extentLat] = formatData(data);
  const imWidth = matrixData[0].length
  const imHeight = matrixData.length
  
  let buffer = new Uint8ClampedArray(imWidth * imHeight * 4);//reserving enough bytes

  //start by y since data grouped by latitude first
  for (let y = 0; y < imHeight; y++) {
    for (let x = 0; x < imWidth; x++) {
        const pos = (y * imWidth + x) * 4; // buffer is a flat array, so calculate corresponding (x, y) coordinates
        buffer[pos  ] = 0; // red layer [0, 255]
        buffer[pos+1] = 0; // green layer
        buffer[pos+2] = matrixData[y][x]; // blue layer
        buffer[pos+3] = 255; // alpha layer
    }
  }



  // create off-screen canvas element to create image
  let dataURL = createImageURL(buffer, imWidth, imHeight)

  return [dataURL, imWidth, imHeight, buffer]
}//convertDatatoImage


function createImageURL(dataBuffer, imWidth, imHeight) {
  // create off-screen canvas element to create image
  const canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d');

  canvas.width = imWidth;
  canvas.height = imHeight;

  // create imageData object
  let imData = ctx.createImageData(imWidth, imHeight);

  // set our data as source
  imData.data.set(dataBuffer);

  // update off-screen canvas with new data
  ctx.putImageData(imData, 0, 0);

  const dataURL = canvas.toDataURL();//produces a PNG file

  return dataURL
}//createImageURL


function loadImage(dataImage, imWidth, imHeight){

  const img = new Image()
  const canvas = d3.select('canvas')
      .attr("width", imWidth)
      .attr("height", imHeight)

  const ctx = canvas.node().getContext('2d')

  img.src = dataImage

  img.onload = function() {

    //flip image vertically
    ctx.scale(1,-1);
    ctx.translate(0,-imHeight);

    ctx.drawImage(img, 0, 0, imWidth, imHeight)
  }
}//loadImage



function updateImageData(dataImage, imWidth, imHeight){

  const img = new Image()
  const canvas = d3.select('canvas')
  const ctx = canvas.node().getContext('2d')
  img.src = dataImage

  img.onload = function() {
    ctx.drawImage(img, 0, 0, imWidth, imHeight)
  }
}//updateImageData


function formatData(data){

  //binning data by 0.02 lat and lon units
  //keep lon and lat not decimal to fix sorting problem
  const nestedData = d3.nest()
    .key(d => _.floor(d.lat*500, -1)/5)
    .sortKeys((a, b) => {
      a = parseFloat(a);
      b=parseFloat(b);
      return d3.ascending(a, b)
    })
    .key(d => _.floor(d.lon*500, -1)/5)
    .sortKeys((a, b) => {
      a = parseFloat(a);
      b=parseFloat(b);
      return d3.ascending(a, b)
    })
    .entries(data)

  //organize data in grid with access by lat/lon keys
  let gridData = {};
  nestedData.map(lat => lat.values.map(
    lon => {
      if (!gridData[lat.key]) gridData[lat.key] = {}
      gridData[lat.key][lon.key] = d3.sum(lon.values, d => d.TOT_P)
      }
    )
  )


  const extentLon = d3.extent(data, d => d.lon*100);
  const extentLat = d3.extent(data, d => d.lat*100);

  const latRange = d3.range(extentLat[0], extentLat[1]+2, 2)
  const lonRange = d3.range(extentLon[0], extentLon[1]+2, 2)

  //put data into matrix covering entire space
  let matrixLatLon = new Array(latRange.length);
  for(var i=0; i<latRange.length; i++) {
    matrixLatLon[i] = new Array(lonRange.length);
  }

  latRange.map((lat, i) => lonRange.map(
    (lon, j) => {
      if (gridData[lat] == null) matrixLatLon[i][j] = 0
      else matrixLatLon[i][j] = gridData[lat][lon] | 0
      }
    )
  )

  return [matrixLatLon, extentLon, extentLat]

}//formatData


function euler(imData, beta, gamma, imWidth, imHeight){

  let newData = []
  //start by y since data grouped by latitude first
  for (let y = 0; y < imHeight; y++) {
    for (let x = 0; x < imWidth; x++) {
      const posS = (y * imWidth + x) * 4 + 2; //blue layer
      const posI = (y * imWidth + x) * 4 + 1;
      const posR = (y * imWidth + x) * 4 + 0; // position in buffer based on x and y

      const posAlpha = (y * imWidth + x) * 4 + 3; // position in buffer based on x and y
      newData[posAlpha] = 255 //alpha channel

      const posS_a = ((y-1) * imWidth + x) * 4 + 2;
      const posI_a = ((y-1) * imWidth + x) * 4 + 1;

      const posS_b = ((y+1) * imWidth + x) * 4 + 2;
      const posI_b = ((y+1) * imWidth + x) * 4 + 1;

      
      //new infection
      let newInfection = (beta * (

        //line above
        imData[posS_a  ] * imData[posI_a  ] +
        imData[posS_a-4] * imData[posI_a-4] +
        imData[posS_a+4] * imData[posI_a+4] +

        //same line
        imData[posS  ] * imData[posI  ] +
        imData[posS-4] * imData[posI-4] +
        imData[posS+4] * imData[posI+4] +

        //line below
        imData[posS_b  ] * imData[posI_b  ] +
        imData[posS_b-4] * imData[posI_b-4] +
        imData[posS_b+4] * imData[posI_b+4]

         )

      ) | 0

      //infected people dying
      let newDead = gamma * imData[posI] | 0


      //if infection is not greater than people in cell
      if (newInfection <= imData[posS]){
        newData[posS] = imData[posS] - newInfection

        //if not all the infected people are dead
        if (imData[posI] + newInfection >= newDead) {
          newData[posI] = imData[posI] + newInfection - newDead
          newData[posR] = imData[posR] + newDead
        }
        else {
          newData[posI] = 0
          newData[posR] = imData[posR] + imData[posI]
        }
        
      } 
      //if more infection than susceptible
      else {

        //if possible new death is possible
        if (imData[posI] + imData[posS] >= newDead) {
          newData[posS] = 0 //no susceptible left
          newData[posI] = imData[posI] + imData[posS] - newDead
          newData[posR] = imData[posR] + newDead
        }
        else {
          newData[posS] = 0
          newData[posI] = 0
          newData[posR] = imData[posR] + imData[posS] + imData[posI]
        }
      }
      
    }
  }
  return newData
}//euler

function storeGuess(event){
  const x = event.offsetX;
  const y = event.offsetY;

  const posI = ((imHeight-y) * imWidth + x) * 4 + 1;
  dataGrid[posI] = 1
}
/**
 * Created by Color on 2016/7/6.
 */

function arraysEqual() {
  const object = {
    "1": [
      {
        "type": 3,
        "value": 1,
        "levelCard": 8,
        "point": 14
      }
    ],
    "7": [
      {
        "type": 1,
        "value": 7,
        "levelCard": 8,
        "point": 7
      }
    ],
    "8": [
      {
        "type": 3,
        "value": 8,
        "levelCard": 8,
        "point": 15
      },
      {
        "type": 3,
        "value": 8,
        "levelCard": 8,
        "point": 15
      }
    ],
    "12": [
      {
        "type": 1,
        "value": 12,
        "levelCard": 8,
        "point": 12
      }
    ],
    "16": [
      {
        "type": 0,
        "value": 16,
        "levelCard": 8,
        "point": 16
      }
    ]
  }

  const sortedObject = Object.keys(object)
    .sort((a, b) => b - a)
    .reduce((result, key) => {
      result[key] = object[key];
      return result;
    }, {});

  console.log(JSON.stringify(sortedObject, null, 2));

}

arraysEqual();

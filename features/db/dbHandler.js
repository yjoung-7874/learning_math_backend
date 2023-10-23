const question = require("./model/Question");
const answer = require("./model/Answer");
const questionInfoSchema = question.questionInfoSchema;
const ImageSchema = question.imageSchema;
const fs = require("fs");
const fileConvert = require("./data/utils/fileConvert")
const CSV = require("./data/utils/handleCSV")
const db = require('./db.js'); // db 불러오기
const { disconnect } = require("process");

const DataFolder = "./data/";

const Collections = { questions: question, answers: answer, };


function filterByChapter(docs, array){
  let returnArray = [];
   array.forEach((cpt) => {
      docs.forEach((element) => {
          if(element.chapter.includes(cpt)){returnArray.push(element);}
      });
  });

  return returnArray;
}

function filterByBookmark(docs, bookmarked) {
  let returnArray = [];
  docs.forEach((element) => {
    if(element.bookmarked === bookmarked) returnArray.push(element)
  })

  return returnArray
}

function getMultipleRandom(arr, num) {
  const shuffeld = [...arr].sort(() => 0.5- Math.random())
  return shuffeld.slice(0,num)
}


module.exports.getQuestionInfo = async () => {
// TODO:: questionType
}

module.exports.getQuestions = async (infos) => {
  console.log("getQuestions called in background");
  console.log('getQuestions, infos:',infos)
  // infos = { questionType: String, difficulty: Array, chapter, paper: Array, timezone: Array, }
  const returned = await Collections.questions.find({
      'difficulty': { $in: infos.difficulty },
      'timezone' : {$in: infos.timezone },
      'paper' : {$in: infos.paper},
      'wrong' : {$gte: infos.wrong},
  }).then((docs) => {
    let result = filterByChapter(docs, infos.chapter)
    if (infos.bookmarked !== undefined) result = filterByBookmark(result, infos.bookmarked)
    return result
  });

  let result = isNaN(infos.questionNumber) ? 
                returned : 
                getMultipleRandom(returned, infos.questionNumber)
  console.log('getQuestions, ',result)
  return result
};

module.exports.getMultipleAnswers = async (infos) => {
  /*
    infos: {answerId, specificAnswerId}
  */
  console.log("getMultipleAnswers called in background");

  const returnList = [];
  for(let i = 0; i < infos.length; i++){
    let result = "";
    infos[i].specificAnswerId == undefined? 
      result = await Collections.answers.findOne({
        'answerID' : { $in: infos[i].answerId },
      }) :

      result = await Collections.answers.findOne({
        'answerID' : { $in: infos[i].answerId },
        'answer.specificAnswerID': { $in: infos[i].specificAnswerId },
      })

      returnList.push(result);
  }
  //?
  console.log("getMultipleAnswers found", returnList);
  return returnList;
};

module.exports.getAnswers = async (infos) => {
  console.log("getAnswers called in background");
  let result = [];
  if(infos.specificAnswerId == undefined){
    result = await Collections.answers.find({
      'answerID' : { $in: infos.answerId },
    })
  }
  else{
    result = await Collections.answers.find({
      'answerID' : { $in: infos.answerId },
      'answer.specificAnswerID': { $in: infos.specificAnswerId },
    })
  }
  console.log("getAnswers result: ", result);
  
  return result;
};

module.exports.saveQuestion = async (infos) => {
  console.log("saveQuestion called in background");
  var myquery = { 
    "questionId": infos.questionId,
  };
  var newvalues = { $set: {bookmarked: infos.bookmarked, wrong: infos.wrong} };

  Collections.questions.updateOne(myquery, newvalues).then(() => {console.log("SAVE QUESTION WORKING")});
};

module.exports.uploadFilesQuestion = () => {
  CSV.readCSV(__dirname + '/data/dataInfo/Questions.csv').then((csv_data) => {
    // console.log("data: ", csv_data);
    let questionFilePath = __dirname + '/data/images/Questions/';
    let questionFileList = fs.readdirSync(questionFilePath, { withFileTypes: true }, (err, files) => {
      if (err) console.log(err);
      else return files
    })

    csv_data.forEach( async (data) => {
      let qfFound = questionFileList.find(element => element.name === data.questionImage);
      if (qfFound === undefined) {
        console.error('q) image name :', data.questionImage, 'is not available.')  
        return;
      } 
      let questionImageFile = fileConvert.base64_encode(questionFilePath + qfFound.name);

      let sqfFound = questionFileList.find(element => element.name === data.subQuestionImage);
      let subQuestionImageFile;
      if (sqfFound === undefined) {
        if (data.subQuestionImage === "None") subQuestionImageFile = ""
        else { 
          console.error('sq) image name :', data.subQuestionImage, 'is not available.')  
          return;
        }
      } else {
        subQuestionImageFile = fileConvert.base64_encode(questionFilePath + sqfFound.name)
      }
      
      let answerSubscripts_ = data.answerSubscripts.split(",")
      let chapter_ = data.chapter.split(",").map((e) => +e)

      let count_ = await Collections.questions.countDocuments({ 
        'questionId': data.questionID, 
        'question.subQuestion': { $elemMatch: { specificQuestionId: data.specificQuestionID }}
      })

      if (count_ === 1) { // exact document exist > update
        await Collections.questions.findOneAndUpdate({ 
          'questionId': data.questionID, 
          'question.subQuestion': { $elemMatch: { specificQuestionId: data.specificQuestionID }}
        }, {
          questionId: data.questionID, 
          question: {
            questionType: data.questionType,
            questionImage: {image: questionImageFile,},
            subQuestion: [{
              subQuestionImage: {image: subQuestionImageFile},
              specificQuestionId: data.specificQuestionID,
              numAns: data.numAns,
              unit: data.unit,
              marks: data.marks,
              instruction: data.instruction,
              answerSubscripts: answerSubscripts_
            }],
          },
          chapter: chapter_,
          difficulty: data.difficulty, // easy, medium, hard
          paper: data.paper,
          timezone: data.timezone,
          season: data.season ,// W or S,
          year: data.year,
          wrong: 0,
          bookmarked: "false",
        }, { 
          new: true, 
          overwrite: true
        })
      } else { // no document or many exist > delete and create new doc
        await Collections.questions.deleteMany({ 
          'questionId': data.questionID, 
          'question.subQuestion': { $elemMatch: { specificQuestionId: data.specificQuestionID }}
        }).then ( async () => {
          const newDoc = new Collections.questions({
            questionId: data.questionID, 
            question: {
              questionType: data.questionType,
            questionImage: {image: questionImageFile,},
              subQuestion: [{
                subQuestionImage: {image: subQuestionImageFile},
                specificQuestionId: data.specificQuestionID,
                numAns: data.numAns,
                unit: data.unit,
                marks: data.marks,
                instruction: data.instruction,
                answerSubscripts: answerSubscripts_,
              }],
            },
            chapter: chapter_,
            difficulty: data.difficulty, // easy, medium, hard
            paper: data.paper,
            timezone: data.timezone,
            season: data.season ,// W or S,
            year: data.year,
            wrong: 0,
            bookmarked: "false",
          })
          await newDoc.save().then(()=>console.log("Question : delete and saved"))
        })
      }
    })    
  })
};


module.exports.uploadFilesAnswer = () => {
  // TODO : db check, getans func return check 
  //db();
  CSV.readCSV(__dirname + '/data/dataInfo/Answers.csv').then((csv_data) => {
    let answerFilePath = __dirname + '/data/images/Answers/';
    let answerFileList = fs.readdirSync(answerFilePath, { withFileTypes: true }, (err, files) => {
      if (err) console.log(err);
      else return files
    })
    csv_data.forEach( async (data) => {
      let ansFound = answerFileList.find((element) => { return element.name === data.answerImage });
      if (ansFound === undefined) {
        console.error('ans) answer name :', data.answerImage, 'is not available.')  
        return;
      } 
      let answerImageFile = fileConvert.base64_encode(answerFilePath + ansFound.name);
      
      let answerSubscripts_ = data.answerSubscripts.split(",");
      let answerValues = data.answerValues.split(",");
      console.log(answerValues, " and ", data.answerValues);

      let count_ = await Collections.answers.countDocuments({ 
        'answerID': data.answerID, 
        'answer.specificAnswerID': data.specificAnswerID 
      })

      if (count_ === 1) { // exact document exist > update
        await Collections.answers.findOneAndUpdate({ 
          'answerID': data.answerID, 
          'answer.specificAnswerID': data.specificAnswerID 
        }, {
          answerID: data.answerID, 
          answer: {
            answerType: data.answerType,
            answerImage: {image: answerImageFile},
            answerSubscripts: answerSubscripts_,
            specificAnswerID: data.specificAnswerID,    
            answerValues: answerValues,
          },
        }, { 
          new: true, 
          overwrite: true
        })
      } else { // no document or many exist > delete and create new doc
        await Collections.answers.deleteMany({ 
          'answerID': data.answerID, 
          'answer.specificAnswerID': data.specificAnswerID 
        }).then ( async () => {
          const newDoc = new Collections.answers({
            answerID: data.answerID, 
            answer: {
              answerType: data.answerType,
              answerImage: {image: answerImageFile},
              answerSubscripts: answerSubscripts_,
              specificAnswerID: data.specificAnswerID,
              answerValues: answerValues,    
            },
          })
          await newDoc.save().then(()=>console.log("Answer : delete and saved"))
        })
      }
    })    
  })      
};
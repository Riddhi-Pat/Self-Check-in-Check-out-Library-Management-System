var express = require('express');
var mysql = require('mysql');
var bodyParser = require('body-parser');

var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
app.use(express.static(__dirname + "/views"));
app.use(bodyParser.json());

//CONNECTION TO DataBase
var db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "library_db"
});

var mqtt = require('mqtt')
var client = mqtt.connect({ port: 1883, host:'192.168.43.101'});

//subscribing to the topic published by raspberry
client.on('connect',function(){
	client.subscribe('Riddhi')
	console.log("Subscribed")
});

//mess will store the message i.e ID published by raspberry
var mess="";
client.on('message', function (topic, message) {
	console.log("ID "+message.toString())
	mess = message;
  });

var tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 13);

//CHECK OUT APIs 
//Search for book acc to book_id, title or author name 
app.get('/bookList/:book_id/:title/:authorFname/:authorLname', function(req, res){
   
	//stores all the rows of the books under given criteria
	var bookall = [];

	//stores all the rows of the only available books under given criteria
   	var bookList = [];
   	db.query('SELECT b.book_id FROM book b, author a WHERE (b.book_id 	REGEXP ? and b.title REGEXP ? and a.auth_fname REGEXP ? and a.auth_lname REGEXP ?) and b.a_id = a.a_id group by b.title, b.book_id', [req.params.book_id, req.params.title, req.params.authorFname, req.params.authorLname],
	function (err, rows) {
   	  if(err){
    	    console.log('Error selecting the Table'+err);
    	    return;
	  }
   	bookall = rows;
   });
console.log(req.params.title +" "+req.params.book_id+" "+ req.params.authorFname,+" "+ req.params.authorLname);
   db.query('SELECT b.book_id, b.title, a.auth_fname, a.auth_lname, b.branch_id, count(b.title) as no_of_copies FROM book b, author a WHERE (b.book_id 	REGEXP ? and b.title REGEXP ? and a.auth_fname REGEXP ? and a.auth_lname REGEXP ?) and b.book_id not in (select bc.book_id from book_loans as bc where date_in is null) and b.a_id = a.a_id group by b.title, b.book_id', [req.params.book_id, req.params.title, req.params.authorFname, req.params.authorLname],
   	function (err, rows) {
   	  if(err){
    	    console.log('Error selecting the Table'+err);
    	    return;
          }
	  console.log('Available books for check out'+rows.length+" from total copies"+bookall.length);
	  bookList = rows;
        for (var i=0; i<rows.length; i++){
		bookList[i]["r_copies"] = rows[i].no_of_copies;
	  }
          if (bookList.length == 0)
		res.send("No book found for this criteria");
	  else          
		res.json(bookList);
   });
   console.log('request received');
});

//checkout update
app.post('/bookList', function(req, res){
   var books_checkedOut;

   //checks the number of books already borrowed by the borrower	
    db.query('select count(*) as no_books from book_loans where student_id = ? and date_in is NULL', [mess],
   	function (err, rows) {
   	  if(err){
    	  	console.log('Error selecting the Table'+err);
    	  	return;
          }
	  books_checkedOut = rows[0].no_books;
          console.log('You already have'+ books_checkedOut + 'books');
        
	  if (books_checkedOut < 3){
		db.query('insert into book_loans(book_id, student_id, date_out, due_date, date_in) values(?, ?, curDate(), DATE_ADD(curDate(), INTERVAL 14 DAY),  NULL)',
	   	[req.body.book_id.toString(), mess],
	   	function (err, rows) {
	   	  if(err){
	    	  	console.log('Error selecting the Table'+err);
			res.send("Member not registered to the system or Scan your card");
	    	  	return;
		  }
		  console.log('Data inserted into Book loans'+books_checkedOut);
		  res.send("Book " + req.body.book_id + " is checked out and to be returned on" + tomorrow);
		});
	     }
	  else{
		 res.send(books_checkedOut + " books are already borrowed");
	  }   
 });
});

//check in api
//show the list of books borrowed by the student or it can also be searched by id and title
app.get('/bookLoanList/:book_id/:title/:fname', function(req, res){
console.log(mess +" "+req.params.book_id+" "+ req.params.title+" "+ req.params.fname);
	 db.query('SELECT l.book_id, bo.title, l_id, date_out, due_date FROM borrower b, book bo, book_loans l WHERE (l.student_id = ? and (l.book_id REGEXP ? and bo.title REGEXP ? and b.fname REGEXP ?)) and l.student_id = b.b_id and date_in is NULL and l.book_id = bo.book_id ',   
	[mess, req.params.book_id, req.params.title, req.params.fname],

   	function (err, rows) {
   	  if(err){
    	    console.log('Error selecting the book loan Table'+err);
    	    return;
          }
	  else{
	  	console.log('Data received from book loan with borrower name'+rows.length);
          	if (rows.length == 0)
			res.send("No book found for this criteria");
	  	else    
			res.json(rows);
	  }
     });
});

//check in the book
app.post('/bookLoanCheckIn', function(req, res){
	db.query('UPDATE book_loans SET date_in = curDate() WHERE l_id = ?',
   	[req.body.l_id],
   	function (err, rows) {
   	  if(err){
    	    console.log('Error updating the book loans Table'+err);
    	    return;
          } 
	  else{
	  	console.log('Date in updated in book loans');
          	res.send('Checked in the book');
	  }
		});
});

  //Add borrower if it does not exists
app.post('/borrowerDetails', function(req, res){
   db.query('insert into borrower(b_id, fname, lname, email, address, phone) values(?, ?, ?, ?, ?, ?)',
   [mess, req.body.fname.toString(), req.body.lname.toString(), req.body.email.toString(), req.body.address.toString(),req.body.phone],
   	function (err, rows) {
   	  if(err){
    	  	console.log('Error inserting into Borrower Table'+err);
		res.send("The borrower cannot be added, she/he is already enrolled!");
    	  	return;
          }
	  else {
		db.query('select b_id from borrower where fname = ? and lname = ? and email = ? and address = ?',
		   [req.body.fname.toString(), req.body.lname.toString(), req.body.email.toString(), req.body.address.toString()],
		   	function (err, rows) {
		   	  if(err){
		    	  	console.log('Fetching Borrower Details'+err);
				res.send("The borrower cannot be added, she/he is already enrolled!");
		    	  	return;
			  } else {
				console.log('Borrower details fetched succesfully');
				res.send("New borrower added\n CARD NO : "+ rows[0].b_id);
			  }
		});
		console.log('Borrower details inserted');
	 }
	res.send("New borrower is added");
   });
});

app.listen(3000);
console.log("Server running in port 3000");
